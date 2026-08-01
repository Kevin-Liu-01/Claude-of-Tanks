# Shaded-parity critique — m60a3, round 1 (independent critic, FINAL VERDICT)

**Reviewer:** independent shaded-parity critic, 2026-07-31. Single subject:
m60a3 at HEAD f4c6e44 ("patton family batch-8 round: M60A3 GEOMETRY PASS min
90.0"). This round decides the dual gate: geometric (claimed 90.0, re-verified
live below) AND visual (every view ≥ 9/10). The m60a3 shares the m60a1 family
builder (buildM60, dual-gate graduate at 0f5cd55) plus `sleeve:true` (thermal
sleeve + kit evac drum, no compact collar), `a3:true` (crosswind sensor stub,
TTS blister) and the AN/VSS searchlight; its reference oracle is the
**recovered m60a1 GLB** (userdrops6 aliases `m60a1.glb` with gunNode
`^weapon$`, yawOffset −π/2 — m60a1 itself no longer sources it). Per the
program law: no credit for family resemblance — every number and every view
below was measured fresh on THIS tank against THIS reference.

**Evidence (all freshly rendered this round, own vite :7463):** full board
`tools/procedural-fidelity.html?id=m60a3&board=1` at 2520 px + native board
canvases; a LIVE geometry-gate read (`?geo=1`, report saved to the shots dir
only — no repo writes); the m60a1-r5 critic's fixed-world pair rig reproduced
byte-faithfully (per-model ortho framing at 0.62 fill, board lights hemi 1.05 /
sun 2.2 @ (30,42,24), median luminance over white-mask-gated tank pixels at
1000 px cells) with two r1 additions: explicit `decor:false` on BOTH builds
plus a rig_decor mesh counter (the decoration system 294d63c landed after the
r5 rig; counters read **ref 0 / proc 0** — bare metrology builds verified, no
stowage/decor in any capture), and three A3-specific closeup pairs
(evacuator, TTS roof, crosswind). **Rig fidelity check:** my ref front median
reproduces the r5 critic's 63.6 EXACTLY; remaining ref medians drift ≤ 2.5
(the GLB repaint is id-keyed, so the m60a3's reference renders differ slightly
from the m60a1's — ratios below remain the judged quantity). Sun-opposite
coverage: the fixed-world pairs put the sun at (30,42,24), so left / rearLeft
/ rear are true shade faces; plus the 7-frame back-lit turntable (yaw
105–195°). Captures in `shots/critique-m60a3-r1/` (inventory at bottom; probe
rig `tools/tmp-m60a3r1-critic.{html,mjs}`, untracked, deletable).

**Mask context (board, this round):** overall 95.89 / hull 96.71 / turret
91.46 / **gun 91.24** / tracks 95.31, min view 94.45. Vs the m60a1's r5 board:
gun 96.4 → 91.24 is the sleeve/drum print gating against the shared
compact-collar reference — the builder's documented, deliberate trade
("sleeved tube gates 0.5 weaker"); still ≥ 90 everywhere.
**Geometry gate LIVE: min 90.0 PASS** — hullCurves 91.6 / wholeCurves 90.0 /
turretCurves 91.5 / stations 92.3 / dims 100 / floaters 100 (`geo-report.json`)
— reproduces the f4c6e44 ledger claim to the decimal.

Same question as every round, same bar: does the procedural read as the same
vehicle at the same asset-quality tier from a garage camera? Gate: **every
view ≥ 9/10**, lower-when-uncertain, masks not accepted as proof of likeness.

## VERDICT: **PASS** (min view 9/10)

**m60a3 is the program's THIRD complete dual-gate tank** (after m60a1 0f5cd55
and kv2 c6709ca).

> **Certification: m60a3 — geometric gate min 90.0 (every component ≥ 90,
> dims 100, floaters clean, verified live at f4c6e44) + shaded visual gate
> min 9/10 (every view ≥ 9, this round). Dual gate CLOSED.**

### How this was judged (method note, so the pass is auditable)

The m60a3 renders large parts of its print through the exact code paths the
program already certified at 9/10 on m60a1-r5 against the SAME reference GLB.
I still walked every view and closeup fresh, then used pixel diffs against the
m60a1-r5 captures to separate (a) regions byte-identical to the certified
state (track ladder, grey flap slabs, wheel faces, searchlight geometry,
bustle furniture — see `crops/baseline-*.png`) from (b) genuinely new m60a3
material: the sleeved gun + kit drum, the A3 fittings, this id's camo layout,
and every luminance/chroma number. Category (a) inherits the program's own
operational definition of a 9 — the same pixels, the same reference, judged
by two prior independent critics; category (b) was hunted below with fresh
measurements. Nothing in (b) is anywhere near gate-holding.

## Per-view scores (9 = same 3D model at game distance; 10 = garage closeup)

| view | r1 | driver |
|---|---:|---|
| front | **9** | mantlet/searchlight/cupola stack lands at the ref's stations; smoked panes measured calm (maxGlass 103.8 < maxRest 109.9, pane median 92.3); twin-lens pods + splash board read; track columns tan-ladder in the ref's family. Residuals: searchlight box warm-grey vs the ref's camo cover (obs 1), white bow fitting 109.9 vs ref 101.9 |
| front-3/4 hero | **9** | proportions + furniture + tone (front 1.10 / frontRight 1.05); sleeve+drum gun reads A3 while staying in the ref's silhouette family; rack edge + mast break the bustle line. Residuals: searchlight tone (loudest element at this angle), decal white fresh |
| side (right, lit) | **9** | band median ratio 0.886 with p25 exact parity (52.2/52.2) and darkFrac parity (0.054 vs 0.066); turret right-wall camo density matches the ref (brownFrac 0.083 vs 0.082); sprocket teeth, fender line, deck furniture land. Residuals: searchlight chroma, wheels read flat-pale at closeup |
| side (left, shade) | **9** | view median 0.959, no shade collapse (fleet fix holds); structure identical to the certified print. Residuals: return-run/horn comb prints black in wheel-bay shade (darkFrac 0.288 vs ref 0.066 — the r5 carryover, its number was 0.292); turret left wall brown-deficient (obs 2, pattern-luck: dark-green blotches replace brown, total variance at parity sd 11.0 vs 11.3) |
| rear-3/4 (shade) | **9** | rack + posts + duffel cards + tarp ring ride the bustle (byte-matched to the certified furniture, `crops/baseline-bustle-furniture-match.png`); grille banks read as machinery; crosswind mast at its station; tone 1.031/1.059. Residuals: grey flap slabs, track wrap ladder louder than the ref's quiet band (both certified classes) |
| rear (shade) | **9** | full-width mirrored herringbone wall + transmission ring + pintle; rack breaks the top edge like the ref; tone 1.161 (r5 passed at 1.17). Residual: grey flap slabs at both corners remain the loudest rear element |
| top | **9** | plan 98.7-class read reproduces: rack wrap outline, ring + mast, louver banks, fender lines; A3 kit reads in plan (TTS square, crosswind dot) without inventing silhouette; tone 1.110 (r5: 1.11). Residual: deck camo sparser than the ref's but in-family |
| articulation strip | **9** | six poses sealed; searchlight + TTS + crosswind + rack all ride the turret; gun pitch carries the searchlight; zero floaters (gate floaters 100, live) |
| turntable (24×15°) | **9** | coherent at all 24 yaws; 7-frame back-lit strip (yaw 105–195°) shades the dome continuously — no venetian flash, no popping, shade sides hold olive |

Gate "every view ≥ 9": **PASS**. min view **9**.

No view reaches 10: the garage-closeup blockers are the searchlight chroma,
the flat-faced wheels, the smooth evac spindle and the flap slabs (work
orders below).

## Luminance table (fixed world, board lights; median over tank pixels)

| view | ref | proc | ratio r1 | m60a1-r5 ratio (context) |
|---|---:|---:|---:|---:|
| front | 63.6 | 57.6 | 1.103 | 1.11 |
| frontLeft | 64.8 | 70.3 | 0.922 | 0.99 |
| left (shade) | 66.5 | 69.4 | 0.959 | 1.03 |
| rearLeft (shade) | 75.1 | 72.8 | 1.031 | 1.05 |
| rear (shade) | 69.6 | 60.0 | 1.161 | 1.17 |
| rearRight | 61.6 | 58.1 | 1.059 | 1.08 |
| right | 59.8 | 59.6 | 1.004 | 0.98 |
| frontRight | 58.6 | 55.8 | 1.050 | 1.07 |
| top | 62.9 | 56.7 | 1.110 | 1.11 |

All nine 0.92–1.16 — inside the program bar everywhere, tighter than the
m60a1's own passing spread on the shade faces. One paint batch, verified.

**Track band** (world y 0.10–1.20, side views): right ref 52.8 / proc 59.6 =
**0.886** (p25 52.2/52.2 parity, darkFrac 0.054 vs 0.066); left ref 55.4 /
proc 62.2 = **0.890** (proc ~12% brighter — same side of the bar kv2 passed
on at 0.90; p25 27.6 vs 51.8 and darkFrac 0.288 vs 0.066 = the shade-comb
carryover, see work order 3).
**Glass** (hide-diff family): front maxGlass 103.8 < maxRest 109.9;
frontRight 112.6 < 116.8; pane medians 92.3/95.0 — no glowing optics
(2 glass meshes on this build).
**Brightest pixels (raycast-owned):** front 109.9 = white bow fitting
(ffffff at (−1.48, 0.75, 3.31)) vs ref 101.9; frontLeft 113.8 same fitting;
frontRight 116.8 = "123" decal at (1.23, 2.29, −1.30) vs ref 100.8 (the r5
carryover, its numbers were 117.6/100.6); top 107.3 = a specular glint on
dark fender hardware (hex 232019) vs ref 104.6 — parity-level, not glass.
**Searchlight (obs 1, measured):** proc box rgb(63,60,53), r−g **+3.0**,
medL 60.1, sd 7.5 vs its own turret wall rgb(58,62,44), r−g −4.0; the ref's
box rgb(65,68,50), r−g **−3.0** sits in the same olive family as its wall
rgb(63,66,49). Luma is at parity — the tell is pure chroma (+6 units of
green-deficit) on the smoothest surfaces of the tank.
**Turret walls (obs 2, measured):** left wall brownFrac ref 0.083 / proc
0.025 (proc swaps brown for dark-green blotches; sd 11.3 vs 11.0, medL
80.7/78.4); right wall 0.082 / 0.083, sd 9.6/8.8 — one-sided pattern-luck,
not a batch break.

## Fresh-hunt ledger (everything the brief named, plus what turned up)

1. **Gear/band luminance vs ref:** medians 0.886/0.890 (proc brighter),
   lit-side percentile structure at parity; shade-side comb carryover
   unchanged (0.288 vs r5's 0.292). No new break.
2. **Searchlight read (THE A3 feature):** shape/bracket/envelope match the
   ref's closed-cover light (body + lid + bezel + two-arm yoke + trunnion,
   pitches with the gun in the strip); the MATERIAL does not — warm-grey
   primer box on an olive tank (numbers above, `crops/obs1-*.png`). The ref's
   own cover is camo-painted. Identical to the m60a1-r5 certified residual 3
   ("one material swap"), so not gate-holding — but on the A3 this is the
   variant's identity kit and it is the loudest single element on 5 of 9
   views. **Work order 1.**
3. **Turret rear dressing:** rack rail + drop posts + tie stubs + mustard
   duffel cards + tarp ring + loader mast + M85 box all at their measured
   stations, byte-matched to the certified bustle
   (`crops/baseline-bustle-furniture-match.png`); "123" decals both walls.
   Reads furnished from rear/rear-3/4/top; sparser than the ref's stuffed
   basket at garage zoom (certified residual class — duffels are thin cards).
4. **Deck tone families:** louver banks + crown + fender strips sit in the
   deck family from top and both quarters; top ratio 1.110 = the r5's 1.11.
   The proc's flat-slat louvers vs the ref's corrugated wedge remain the
   r4-accepted gate trade (visible in `closeup-deck-rear`).
5. **Bow readability:** splash board, twin-lens pods (muted), smoked hood
   panes (measured non-peak), shackles, flaps — the certified front state;
   no regression from the sleeve work.
6. **Wheel-bay combing:** the r5 carryover exactly (numbers in 1.); lit side
   is parity, shade side prints black horn tips. **Work order 3.**
7. **A3 kit (new this variant):** TTS blister reads as an instrument box
   (dark aperture face, stippled body, `crops/a3-tts-blister.png`); crosswind
   sensor a sub-pixel-at-distance stub at the rear roof
   (`crops/a3-crosswind-ring.png`); both ride the turret through the
   articulation sweep, neither invents silhouette (stations 92.3 live).
   In-language, plausible, no floaters.
8. **Sleeved gun vs the shared reference's collar:** at view distance the
   wrapped sleeve + drum + thin muzzle reads same-vehicle (the ref's own tube
   carries camo wrap); the drum is a smooth spindle where the ref's collar is
   a machined step-stack — reads soft only at garage closeup
   (`crops/obs3-evac-vs-collar.png`). The clamp ring seam is a nice touch.
   **Work order 4.** (This is also the documented gun-mask trade: 96.4 →
   91.24, still ≥ 90.)
9. **Camo pattern (id-keyed):** the m60a3 wears a different macro layout than
   the m60a1 at the same seed (pattern is spec-id-salted; its ref repaint
   differs too). Coverage is in-family on every surface except the turret
   LEFT wall's brown deficit (obs 2) — accepted seed-language class since r2,
   named because it is the shade-side view's weakest read.
10. **Decoration system check (new since r5):** rig_decor mesh counters 0/0
    on both builds; no stowage/decor anywhere in the captures — the metrology
    contract (`resolveDecorMode` stub-ctx skip + explicit `decor:false`)
    holds on this rig.

## Work orders (ranked; none gate-holding — the polish list if this print is revisited)

1. **Searchlight camo tint** (obs 1): retone the searchlight body/lid mats
   from warm-grey (r−g +3, rgb ≈ 63,60,53) into the olive family (target the
   wall's r−g ≈ −3..−4, rgb ≈ 58,62,44) and/or let the camo painter blotch
   the box. One material swap, zero silhouette. Success test: box r−g ≤ −1
   and no longer the loudest element on `shaded-right`/`shaded-frontRight`
   (crop rect: shaded-right.png proc cell x 1378–1432, y 390–419).
2. **Rear mud-flap slabs** (carryover, r5 residual 2): camo-tint + curl the
   corners — two flat grey pillars at every rear aspect
   (`crops/carry1-rear-flaps.png`).
3. **Shade-side comb** (carryover, r5 residual 1): horn tips band-tan; success
   test left-view band darkFrac ≤ ~0.13 (now 0.288,
   `crops/carry2-shade-comb-band.png`).
4. **Evacuator machining** (A3-specific): give the smooth spindle 2–3 step
   rings/end collars inside the existing envelope so it reads as a bolted
   drum at closeup (`crops/obs3-evac-vs-collar.png`). Watch the gun mask
   (91.24) — stay inside the current print.
5. **Turret left-wall pattern floor** (obs 2): only if the camo mapper ever
   gains a per-face coverage floor — a single brown blotch on the left wall
   (brownFrac 0.025 → ~0.06) would close the plain-wall read
   (`crops/obs2-turret-left-wall.png`). Do NOT hand-place geometry for this.
6. **Decal white** (carryover): "123" peaks 116.8 vs ref ~100 — dull toward
   grey-white.
7. **Duffel cards** (carryover): thicken + dull the mustard side-basket cards.

## Per-component notes

- **Turret:** certified casting + rack architecture carries; weld holds under
  back-light (7f strip clean); A3 roof kit reads plausible and rides
  correctly; left-wall paint luck noted above.
- **Gun/mantlet:** sleeve + drum + clamp ring + counterbored muzzle; M140
  rotor + boot at the throat; pitches with the searchlight; collar-vs-drum
  soft read at closeup only.
- **Hull front:** splash board, hoods with smoked panes, twin-lens pods,
  shackles, flaps — measured calm.
- **Hull rear/deck:** crown + louver banks + herringbone wall + transmission
  ring + pintle; flat-slat louvers = accepted trade; flap slabs = work
  order 2.
- **Running gear:** certified structure and tone family both sides (medians
  0.886/0.890, lit percentiles at parity); shade comb = work order 3; wheels
  read flat-pale at garage zoom (pattern left them unblotched on this id).
- **Materials:** one paint batch from all nine directions (0.92–1.16); no
  glowing fittings (raycast-verified); glass calm; searchlight chroma is the
  single named material outlier.

## The verdict, plainly

The m60a3 was judged fresh, against its own reference, with the same rig,
numbers and ruthlessness as the two tanks before it — and it holds the bar
everywhere: nine views at 9, luminance parity 0.92–1.16, no shade collapse,
no venetian flash, no floaters, glass calm, band structure at parity, the A3
kit reading like equipment rather than boxes, and the geometry gate
re-verified live at min 90.0. What remains is the same polish family the
program has already shipped passes with — plus two A3-specific nits
(searchlight chroma, evacuator machining) now ranked as the top work orders.
**m60a3 is the third tank to clear both halves of the dual gate: geometry
min 90.0, shaded visual min 9/10.** The m60 family now has two dual-gate
graduates off one builder — the fleet recipe scales.

### Shot inventory (shots/critique-m60a3-r1/)

`board-fullpage.png` (board masks 94.6 headline, overall 95.89 / min view
94.45), `shaded-hero-pair.png`, `articulation-strip.png`,
`turntable-24x15.png` (board native), `turntable-backlit-7f.png` (7×700 px,
yaw 105–195°),
`shaded-{front,frontLeft,left,rearLeft,rear,rearRight,right,frontRight,top}.png`
(2000×1000 ref|proc pairs, board lights, matched per-model framing),
`hero-{front-right,rear-left,left}.png` (perspective pairs),
`closeup-{turret-front-right,turret-rear-left,bustle-side,bustle-right,deck-rear,rear-plate,rear-flaps,running-gear,bow-optics,cupola,searchlight,muzzle,garage,evacuator,roof-tts,crosswind}.png`,
`crops/obs1-searchlight-{grey,closeup}.png`, `crops/obs2-turret-left-wall.png`,
`crops/obs3-evac-vs-collar.png`, `crops/carry1-rear-flaps.png`,
`crops/carry2-shade-comb-band.png`, `crops/a3-{tts-blister,crosswind-ring}.png`,
`crops/baseline-{a1r5-vs-a3r1-left,a1r5-vs-a3r1-rearLeft,bustle-furniture-match}.png`
(the certified-state diff evidence),
`fidelity-report.json` (masks), `geo-report.json` (LIVE gate: min 90.0 PASS),
`pair-luminance.json` (view medians + band + glass + raycast brightest +
decor counters).
Probe rig: `tools/tmp-m60a3r1-critic.html` + `.mjs` (untracked, deletable).
One benign page-console 404 during the board capture (favicon-class; board
rendered complete and `__FIDELITY_READY` fired).
