# Shaded-parity critique — m60a1, round 5 (independent critic, FINAL VERDICT)

**Reviewer:** independent shaded-parity critic, 2026-07-31. Single subject:
m60a1 after the builder's closing round (commit c391756 "rack/glass/grille/
track-tone", on top of 34f69b8 loft weld + 412399e shade fix). This round
decides the dual gate: geometric (already ≥90) AND visual (every view ≥ 9/10).
**Evidence (all freshly rendered this round, own vite :7461):** full board
`tools/procedural-fidelity.html?id=m60a1&board=1` at 2520 px viewport +
native-res board canvases; a LIVE geometry-gate read (`?geo=1`, no repo
writes); the fixed-world sun-opposite pair rig re-implemented from the r4
method (per-model ortho framing, the board's exact lights hemi 1.05 / sun 2.2
@ (30,42,24), median LUMINANCE over white-mask-gated tank pixels at 1000 px
cells — ratios directly comparable to r4's pair-luminance.json); brightest-
pixel RAYCAST identification on the proc front/frontLeft/frontRight/top
orthos (independent of the builder's hex-match glass classification);
glass-family hide-diff stats; undercarriage band medians (world y 0.10–1.20)
+ dark-pixel fraction on both pure sides; hero pairs from three world
directions; 13 perspective closeup pairs at every r4 tell subject plus fresh
hunt angles (right basket, rear flaps, searchlight face); 7-frame back-lit
turntable at 700 px (yaw 105–195°, the r3 venetian-flash conditions).
Captures in `shots/critique-m60a1-r5/` (inventory at bottom; probe pages
`tools/tmp-m60r5-critic.{html,mjs}`, untracked). **Mask context: r3/r4-
identical to the decimal** — overall 96.0 / hull 96.7 / turret 91.1 / gun
96.4 / tracks 95.3, min view 94.45 (rearRight) — the rack landed with zero
silhouette cost, verified live, not taken from the commit message.
**Geometry gate LIVE: min 90.7 PASS** — hullCurves 91.6 / wholeCurves 90.7 /
**turretCurves 91.3** (up from 91.1 exactly as the closing round claimed) /
stations 92.4 / dims 100 / floaters 100 (`geo-report.json`). Same question
as r1–r4, same bar: does the procedural read as the same vehicle at the same
asset-quality tier from a garage camera? Gate: **every view ≥ 9/10**,
lower-when-uncertain, masks not accepted as proof of likeness.

## VERDICT: **PASS** (min view 9/10) — all four r4 tells are dead

**This is the program's first complete dual-gate tank.**

> **Certification: m60a1 — geometric gate min 90.7 (every component ≥ 90,
> dims 100, floaters clean, verified live at c391756) + shaded visual gate
> min 9/10 (every view ≥ 9, this round). Dual gate CLOSED.**

The four-item r4 list shipped complete and each item passes its own stated
success test, measured on this round's fresh captures:

1. **Bustle rack + stowage (r4 tell 1, the rear-identity kill item):** a real
   rack now wraps the bustle — top rail at the roof-shoulder polyline, a
   stand-off basket rail with hanging posts on both walls (left high/right
   shallow, matching the reference's own asymmetry), rear-wrap drop posts +
   cross rails, tarp roll + two duffels + lying jerry can with hold-down
   straps inside the wrap, side-basket duffels behind the rails, the M19
   roof tarp ring flat at the reference's own station, and the loader-area
   mast (the measured ref-only trace sliver — turretCurves went UP when it
   landed, exactly the prediction). The turret rear reads FURNISHED from
   rear, both rear-3/4s, sides and plan; the top-edge silhouette of the rear
   view now breaks with stowage bumps + posts + mast the way the reference's
   does. Masks unchanged to the decimal = zero silhouette cost.
2. **Smoked-glass calm-down (tell 2):** measured on the front ortho, the
   brightest tank pixel is **no longer glass** (max glass 103.8 vs max
   non-glass 110.0; frontRight 112.6 vs 117.6; pane median 92–95 sits below
   the lit camo plates). Raycast confirms the front/frontLeft/frontRight
   peaks are non-glass surfaces. The panes read as muted blue-grey
   instrument chips at every range — no glow, no LED-white cupola blocks
   (seven muted chips). On the top view the peak pixel IS a glacis pane at
   106.7 — but the reference's own peak is 105.3: parity-level, not a
   blowout. Tell dead by its own test.
3. **Rear-plate louver wall (tell 3):** full-width treatment — two mirrored
   herringbone banks (8–9 slats each) over widened dark recessed panels,
   slat faces at the proven flush plane. The rear plate reads "ribbed
   machinery" from rear, rear-3/4 and the back-lit turntable frames, against
   the transmission ring + access plate. The reference's ribbing is denser
   (finer pitch, covers slightly more of the plate) — a texture-density nit,
   no longer a category difference. Dead per the r4 prescription (8–10
   slats, full width).
4. **Track-band retone (tell 4):** measured band medians ref/proc — right
   (lit) 0.914, left (shade) 0.963, both far inside the r4 pass bar (≤ ~1.4x)
   and matching the builder's 0.91–0.96x claim. Lit-side dark-pixel fraction
   0.054 vs ref 0.066 — parity. The charcoal batch is dead; pads/wheels/
   bottom-run sit in the reference's grey-olive family from every view.

Shade parity (the fleet fix) still holds: all nine view medians ref/proc
1.0–1.17x (r4: 1.01–1.16), shade faces left 1.03 / rearLeft 1.05 /
frontLeft 0.99. One paint batch, verified again.

## Per-view scores (9 = same 3D model at game distance; 10 = garage closeup)

| view | r3 | r4 | r5 | Δ | r5 driver |
|---|---:|---:|---:|---:|---|
| front | 6 | 8 | **9** | +1 | panes calm (measured non-peak), track columns tan ladder in ref's family, twin lenses land; residual: searchlight box dark-grey vs ref's camo closed-cover box |
| front-3/4 hero | 4 | 8 | **9** | +1 | pips muted, band retoned, rack edge + mast read at the bustle; residual: searchlight tone, decal white a touch fresh (peak 117.6 vs ref 100.6) |
| side (right, lit) | 6 | 8 | **9** | +1 | band 0.914 + darkFrac parity — comb reads as sun-lit track detail; basket rail + posts read; residual: grey flap tab at fender end |
| side (left, shade) | — | 8 | **9** | +1 | band median 0.963 PASS; residual named: return-run/horn comb still prints black in shade (darkFrac 0.292 vs ref 0.066, p25 27 vs 52) — texture-contrast, not a batch break; identity holds |
| rear-3/4 (shade) | 3 | 7 | **9** | +2 | rack reads (rails/posts/stowage/mast), grille reads from the quarter, deck louvres machinery; residuals: grey flap slabs, shade-side comb |
| rear (shade) | 5 | 7 | **9** | +2 | full-width herringbone wall = ribbed machinery; rack breaks the top-edge silhouette like the ref; residual: grey flap slabs at both corners |
| top | 7 | 9 | **9** | 0 | plan 98.7; rack outline in plan matches the ref's basket wrap; ring + mast + bays land |
| articulation strip | 9 | 9 | **9** | 0 | six poses sealed, searchlight pitches, rack rides the turret, pips now muted; zero floaters (gate floaters 100) |
| turntable (24×15°) | 8 | 9 | **9** | 0 | coherent at all 24 yaws with the rack mounted; back-lit 7f strip clean — weld holds; flaps announce at rear yaws |

Gate "every view ≥ 9": **PASS**. min view 3 → 7 → **9**.

r2-continuity line (SD/MA/WT/TC/HC/SP/OV): **8 / 8 / 8 / 9 / 8 / 9 / 9**
(r4: 7/7/8/8/8/9/7). Turret character 8 → 9 is the rack; materials 7 → 8 is
glass + band landing minus the greys below.

## Luminance table (fixed world, board lights; median over tank pixels)

| view | ref | proc | ratio r5 | ratio r4 |
|---|---:|---:|---:|---:|
| front | 63.6 | 57.3 | 1.11 | 1.12 |
| frontLeft | 64.0 | 64.5 | 0.99 | 1.01 |
| left (shade) | 64.0 | 62.2 | 1.03 | 1.05 |
| rearLeft (shade) | 73.2 | 70.0 | 1.05 | 1.07 |
| rear (shade) | 67.0 | 57.3 | 1.17 | 1.16 |
| rearRight | 61.1 | 56.7 | 1.08 | 1.11 |
| right | 58.5 | 59.6 | 0.98 | 1.03 |
| frontRight | 58.4 | 54.9 | 1.07 | 1.09 |
| top | 61.6 | 55.7 | 1.11 | 1.12 |

Track band (world y 0.10–1.20, side views): right ref 52.8 / proc 57.9 =
**0.914**; left ref 55.1 / proc 57.2 = **0.963** (r4 bar ≤ ~1.4x: PASS).
Glass: front maxGlass 103.8 < maxRest 110.0; frontRight 112.6 < 117.6;
pane median 92.3/95.0; top peak = pane 106.7 vs ref peak 105.3 (parity).
Brightest-pixel owners (raycast): front + frontLeft = white bow fitting
(hex ffffff, (1.52, 0.75, 3.31)); frontRight = "123" decal digits
((1.23, 2.29, −1.30)); top = glacis pane (hex 46525b). No glowing glass.

## r4 tell ledger — all four CLOSED (verified at the crop subjects)

1. `crops/tell4-bustle-rack.png` + `closeup-bustle-side/right.png`,
   `shaded-rear*.png`: rack present as a shaded volume from every rear
   aspect; rails + posts + stowage + ring + mast; silhouette-flush (masks
   unchanged); turretCurves +0.2.
2. `crops/tell2-glacis-optics.png` + `crops/tell6-cupola-blocks.png`:
   smoked panes, muted chips, measured non-peak (numbers above).
3. `crops/tell3-rear-plate.png` + `crops/zoom-rear-pair.png`: full-width
   herringbone louver wall over recessed panels; ribbed-machinery read.
4. `crops/tell5-track-tone.png` + `crops/zoom-left-band.png` + band table:
   grey-olive family both sides, medians 0.91–0.96x.

r3 kill item (contour-slice corrugation): still dead with the rack mounted —
re-verified on the 24-frame turntable and the 700 px back-lit strip
(`turntable-backlit-7f.png`); the dome shades continuously at every yaw,
creases only at the true knuckles.

## Residuals (named, none gate-holding — the polish list if this print is revisited)

1. **Shade-side return-run comb** (r4 carryover, reduced): the inner-chain/
   horn layer still prints near-black in wheel-bay shade — left-view band
   darkFrac 0.292 vs ref 0.066 (p25 27 vs 52) while the lit side is at
   parity. The r4 sub-ask "paint horn tips band-tan" was only partially
   taken (pads + shoes lifted, tips left dark). Success test if picked up:
   left-view darkFrac ≤ ~0.13. Note: the shipped envMapIntensity bump is a
   no-op on the board rig (no env map in the lab scene); it may read softer
   in-game.
2. **Grey rear mud-flap slabs** (r4 carryover, now the loudest remaining
   element at rear views): two flat neutral-grey squares at the fender ends
   vs the reference's camo-painted curled panels (`closeup-rear-flaps.png`).
   Camo-tint + curl the corners — material + two boxes.
3. **Searchlight body/face** (r4 carryover): uniform dark grey with a flat
   face; the reference's own cover is CLOSED and camo-painted — so parity
   wants a camo box, not a lens (the r3 "instrument" prescription was
   calibrated to the real vehicle, not this print). One material swap.
4. **Right basket rail at closeup**: with only two posts + tie stubs and a
   thin 0.030 rail, the right side reads as disconnected brackets at garage
   zoom (`closeup-bustle-right.png`); the left side reads complete. One more
   post or a 0.034 rail closes it.
5. **Side-basket duffels**: 0.034–0.038 thick pale-straw cards at closeup;
   the ref's stowage is grey volumes. Thicken + dull.
6. **Decal white too fresh**: proc "123" peaks 113–118 vs the ref's
   weathered ~100 — the actual brightest surface on three of four measured
   views. Dull toward grey-white.
7. **Cast stipple** at garage range (r4 carryover) and the **flat-bay deck
   louvres** vs the ref's corrugated wedge (r4-accepted gate trade) — both
   sub-identity.
8. Lab note, not a model item: the board hero pair frames ref/proc at
   different apparent scales (the ref bbox carries a taller mast family);
   same in r4 — judged through the probe's matched-fill pairs instead.

## Per-component notes

- **Turret + rack:** casting weld holds under back-light with the rack
  mounted; rack built to the reference's own measured envelope (rail tops
  +6 mm over the roofline — the ref's own rack is near-flush; its identity
  is rim + posts + stowage contrast, which the build now carries); plan
  outline matches the ref's basket wrap; ring/latch/mast at their measured
  stations.
- **M19 cupola:** ring, band, 7 muted-glass blocks, domed cap, M85 box +
  stub, blade — blade/stub no longer read as the r4 grey plank at the
  closeup angles sampled; blocks calm.
- **Gun/mantlet:** compact mid-tube evacuator, muzzle counterbore, camo
  wrap — parity; boot stipple is residual 7.
- **Hull front:** splash board, hoods with smoked panes, twin-lens lamp
  pods, shackles, camo flaps — the r4 "glowing rectangles" dead.
- **Hull rear/deck:** louver bays read as machinery; full-width herringbone
  rear wall; pintle + ring + cable present; grey flap slabs = residual 2.
- **Running gear:** best-in-fleet structure, now in the reference's tone
  family from every view; shade-side comb = residual 1.
- **Materials:** shade parity 1.0–1.17x re-verified; glass calm and
  measured; camo palette/scale in-family (macro pattern differs by seed,
  accepted since r2).

## The verdict, plainly

r3 failed this tank on a casting that could not survive light. r4 failed it
on four mechanized tells. r5 finds all four dead by their own stated tests,
nothing regressed, the geometry gate re-verified live at min 90.7 with
turretCurves UP from the rack round, and no new tell anywhere near
gate-holding. The remaining list is polish, not parity. **m60a1 is the
program's first tank to clear both halves of the dual gate: geometry min
90.7, shaded visual min 9/10.**

### Shot inventory (shots/critique-m60a1-r5/)

`board-fullpage.png`, `shaded-hero-pair.png` (board native),
`articulation-strip.png`, `turntable-24x15.png` (board native),
`turntable-backlit-7f.png` (7×700 px, yaw 105–195°),
`shaded-{front,frontLeft,left,rearLeft,rear,rearRight,right,frontRight,top}.png`
(2000×1000 ref|proc pairs, board lights, matched per-model framing),
`hero-{front-right,rear-left,left}.png` (perspective pairs),
`closeup-{turret-front-right,turret-rear-left,bustle-side,bustle-right,deck-rear,rear-plate,rear-flaps,running-gear,bow-optics,cupola,searchlight,muzzle,garage}.png`,
`crops/tell{1-searchlight-face,2-glacis-optics,3-rear-plate,4-bustle-rack,5-track-tone,6-cupola-blocks}.png`,
`crops/zoom-{front-pair,rear-pair,left-band}.png`,
`fidelity-report.json` (masks 96.0 overall / 94.45 min — r3/r4-identical),
`geo-report.json` (LIVE gate: min 90.7 PASS, turret 91.3, dims 100),
`pair-luminance.json` (view medians + glass + band + raycast brightest).
Probe rig: `tools/tmp-m60r5-critic.html` + `.mjs` (untracked, deletable).
