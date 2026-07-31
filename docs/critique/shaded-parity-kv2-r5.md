# Shaded-parity critique — kv2, round 5 (independent critic, FINAL VERDICT)

**Reviewer:** independent shaded-parity critic, 2026-07-31. Single subject:
kv2 after the builder's closing round (commit c6709ca "five tells shipped",
on top of 2e4f158 wheels/bow-kit/mantlet + 412399e fleet shade fix). This
round decides the dual gate: geometric (already ≥90) AND visual (every view
≥ 9/10).
**Evidence (all freshly rendered this round, own vite :75xx):** full board
`tools/procedural-fidelity.html?id=kv2&board=1` at 2520 px + native board
canvases; a LIVE geometry-gate read (`?geo=1`, report saved to the shots dir
only — no repo writes); the r4 fixed-world pair rig re-implemented from the
closing agent's documented probe (1100 px tiles, per-model ortho framing at
0.62 fill, board lights hemi 1.05 / sun 2.2 @ (30,42,24), median luminance
over white-mask-gated tank pixels) — my band rows reproduce the closing
probe's numbers to the third decimal and the r4 critic's ref left bottom-run
**55.6 exactly**, so all three rounds' numbers are directly comparable; the
closing agent's occlusion-preserving TRACK-BAND component masks (strict
env≤0.101 family, ref 4 / proc 13 meshes; whole-gear 6 / 21) with the
bottom-run slice below world y 0.48; top-view CHROMA metrics (median r−g /
b−g, pink-pixel fractions) over the whole tank and the aft engine-deck world
rect; brightest-pixel RAYCAST identification on the proc front/top orthos;
flat ORTHO ZOOM pairs on the three architecture tells (turret rear dead
astern, aft-deck plan, bow dead-on, both gear bands at 458 px/m); 12
perspective closeup pairs at every r4 tell subject plus fresh hunt angles
(sprocket face, idler face, links, rear quarter); 7-frame back-lit turntable
(yaw 105–195°). Captures in `shots/critique-kv2-r5/` (inventory at bottom;
probe pages `tools/tmp-kv2r5-critic.{html,mjs}`, untracked, deletable).
**Mask context: r3/r4-identical** — overall 96.27 / hull 96.15 / turret
86.61 / gun 28.32 [certified oracle residual, not counted] / tracks 92.31,
min view 94.99 (top 98.8, all nine 95.0–98.8) — the door/ball/gear/bow work
landed with zero silhouette cost, verified live.
**Geometry gate LIVE: min 90.2 PASS** — hullCurves 92.1 / wholeCurves 90.2 /
turretCurves 90.3 / stations 96 / dims 100 / floaters 100
(`geo-report.json`) — matches the builder's claim of holding 90.2 through
the five-tell round. Same question as r1–r4, same bar: does the procedural
read as the same vehicle at the same asset-quality tier from a garage
camera? Gate: **every view ≥ 9/10**, lower-when-uncertain, masks not
accepted as proof of likeness.

## VERDICT: **PASS** (min view 9/10) — all five r4 tells are dead

**kv2 is the program's SECOND complete dual-gate tank** (after m60a1,
0f5cd55).

> **Certification: kv2 — geometric gate min 90.2 (every component ≥ 90,
> dims 100, floaters clean, verified live at c6709ca) + shaded visual gate
> min 9/10 (every view ≥ 9, this round). Dual gate CLOSED.**

The five-item r4 list shipped and each item passes its own stated success
test, measured on this round's fresh captures:

1. **Gear hardware retone (r4 tell 1, the 5-view item):** the near-black
   band is dead by measurement and by eye. Component-mask band medians
   ref/proc: left strict-track 1.06 (bottom-run **0.92** — the builder's
   claimed number reproduces on my rig), right strict-track 1.00, whole-gear
   0.90/0.93 — everything inside the ~1.3x bar, and the r4 median/mean split
   (medians 1.03 vs means 1.15) is CLOSED: view means now 1.01–1.13. Hue
   family matched: proc band rgb(65–67, 57–60, 45–48) vs ref
   rgb(61–69, 54–64, 42–55) — warm rusty two-tone both sides, links/cleats/
   hangers all in it. Verified at the exact r4 crop rect
   (`crops/tell1-gear-tone.png`): the void band is now a busy warm band.
2. **Drum faces (tell 2):** both dinner plates are dead. The sprocket face
   is a dark layered disc with hex hub plate + bolt ring, tonally integrated
   with the dark drum and the warm link wrap (`closeup-sprocket.png`) — the
   "glowing blank plate" at the r4 rear34 rect is gone
   (`crops/tell2-drum-faces.png`). The idler face is a dark annulus with six
   broad spokes + rim/hub rings, the kit cap reading as the small hub like
   the ref's (`closeup-idler.png`) — the "hub-cap idler" is gone. Links read
   as angular two-tone plates with pale worn edges, not black beads.
3. **Turret rear (tell 3, the biggest surface):** rebuilt architecture reads
   from every rear aspect. Dead astern (`zoom-turret-rear.png`, 290 px/m)
   the proc carries a proud offset door plate with corner bolts, vision
   slot, horizontal strap hinges + latch, a dark moat frame, and the MG ball
   collar at tank-right — the same stations as the ref's own door/ball. At
   game distance (`pair-rear.png`, r4 rect crop `crops/tell3-turret-rear.png`)
   the rear face reads FURNISHED — the r4 "80% blank wall" is dead. Holds
   from rear-3/4, the rear quarter closeup and the back-lit hero.
4. **Deck de-pink (tell 4):** measured dead. Top-view chroma: aft-deck
   pink-pixel fraction (r−g ≥ 8) proc 0.47% vs ref 0.07%, strong-pink
   (r−g ≥ 14) ZERO on both — the r4 mauve batch (fan well, dome caps,
   ventilator, intake inserts as pink blobs/C-rings) has no survivor
   (`crops/tell4-deck-pink.png`). The whole-view pink8 3.15% is the warm
   track runs at r−g ≈ +7..9 crossing the threshold, not fittings —
   raycast-confirmed (top brightest = a warm link pad, hex 423a2e). Roof
   furniture (domes, ventilator, hatch rings) now crisp olive; the
   spare-links board rides the warm track family with pin-gap seams.
5. **Bow readability (tell 5):** mostly dead. The headlight exists dead-on
   now (drum + dark bezel + lens ring + flat guard bar at the crest — reads
   at closeup range, still modest at distance); the nose shelf carries plate
   seams + an 11-stud row + hook plates, breaking the r4 "rounded bumper
   bar" read; the dashed nose weld line is present; honeycomb muzzle face
   shipped; the "2" decal is gone (parity-strict ✓). The one surviving
   sub-item: the two draped tow cables got 0.046 rope + shadow seams but
   still render near contrast-zero against the glacis — the ref's bow is
   dominated by its fat shadowed ropes at front/hero angles, the proc's
   reads clean (residual 1 below).

Shade parity (the r3 catastrophe, fleet fix 412399e) holds everywhere:
all seven view medians ref/proc 1.00–1.14 (r4: 1.03–1.15; r3: 1.16–3.55),
shade faces left 1.00 / rear34 1.01 / rear 1.03, back-lit 7-frame turntable
clean of venetian flash, articulation cell-1 tonally matched. One paint
batch, re-verified.

## Per-view scores (9 = same 3D model at game distance; 10 = garage closeup)

| view | r3 | r4 | r5 | Δ | r5 driver |
|---|---:|---:|---:|---:|---|
| front | 7 | 8 | **9** | +1 | track wraps now rusty link stacks (r4's black slabs dead), forged hooks, MG dome, tone 1.01; residual: cables/headlight still sub-readable dead-on (ref's own are subtle at distance) |
| front-3/4 hero | 8 | 8 | **9** | +1 | the r4 "different batch" tells (black bead-link row + comb teeth) are warm and integrated; mantlet reads cast at hero range; residual: bare-ish glacis vs the ref's rope-dominated bow |
| side (right, lit) | 7 | 8 | **9** | +1 | all four r4 view-tells dead: rail row warm/integrated, links angular two-tone, sprocket a dark face set, idler spoked; residual: row uniformity reads clean-synthetic at closeup |
| side (left, shade) | 5 | 7 | **9** | +2 | the last component-scale material break is measured dead: strict band 1.06 (bottom-run 0.92), whole-gear 0.90, view 1.00; wheel pockets have AO-dark floors; residual: pocket circles louder than the ref's subtle voids |
| rear-3/4 (shade) | 5 | 7 | **9** | +2 | two of three r4 view-tells dead (turret rear dressed, sprocket dark); tone 1.01; residual: fan wells still read flush from the quarter (below) |
| rear (shade) | 5 | 7 | **9** | +2 | the dominant surface is dressed at game distance (ball C-collar + door hardware); tail plate dressed, track ends warm; tone 1.03 |
| top | 7 | 7 | **9** | +2 | pink batch measured dead, layout mask-proven (top 98.8), roof furniture crisp olive, spare-links slab track-dark; paint 1.14 (r4 1.15, inside the ~1.3 gate — builder-documented residual); residual: fan wells flush, intake read thin |
| articulation strip | 9 | 9 | **9** | 0 | six poses sealed, door/ball ride the turret through the sweep, zero floaters (gate floaters 100), both rows tonally matched |
| turntable (24×15°) | 9 | 9 | **9** | 0 | coherent full sweep; 7-frame back-lit strip holds olive with a dressed rear; no popping/floaters |

Gate "every view ≥ 9": **PASS**. min view 5 → 7 → **9**.

r2-continuity line (SD/MA/WT/TC/HC/SP/OV): **8 / 8 / 8 / 9 / 8 / 9 / 9**
(r4-era estimate: 8/6/7/7/8/9/7). Materials 6 → 8 is the gear retone +
de-pink landing; wheels/tracks 7 → 8 the face sets.

## Luminance table (fixed world, board lights; median over tank pixels)

| view | ref | proc | ratio r5 | ratio r4 | ratio r3 | mean-ratio r5 |
|---|---:|---:|---:|---:|---:|---:|
| front | 59.0 | 58.4 | **1.01** | 1.06 | 1.62 | 1.03 |
| right | 54.3 | 51.6 | **1.05** | 1.08 | 1.34 | 1.04 |
| left (shade) | 57.9 | 57.7 | **1.00** | 1.03 | 3.55 | 1.01 |
| rear34 (shade) | 68.6 | 67.6 | **1.01** | 1.03 | 2.68 | 1.02 |
| rear (shade) | 59.7 | 57.9 | **1.03** | 1.07 | 3.29 | 1.03 |
| top | 54.3 | 47.7 | **1.14** | 1.15 | 1.16 | 1.13 |
| hero | 49.0 | 45.3 | **1.08** | 1.10 | 1.21 | 1.05 |

The r4 fail signature — medians 1.03 with means 1.15 (near-black gear pixels
dragging every mean) — is gone: means 1.01–1.13. Track-band component rows
(occlusion-preserving masks): left strict 64.4/60.6 = 1.06, left bottom-run
55.6/60.6 = **0.916**; right strict 57.6/57.8 = 0.996, right bottom-run
1.01; whole-gear left 0.90 / right 0.93 (proc runs 7–10% brighter than the
ref's gear — inside the bar, noted below). Chroma: ref top-all medRG −3 /
pink8 0.0009; proc top-all medRG −4 / pink8 0.0315 (track runs, see tell 4);
aft-deck rect proc pink8 0.0047, pink14 0.0000. Brightest pixels: front proc
106.1 (a white-base link-pad wear sparkle at the toe, hex ffffff) vs ref
92.3; top proc 81.1 (warm pad) vs ref 96.8 — no glowing fittings.

## r4 tell ledger — all five CLOSED (verified at the crop subjects)

1. `crops/tell1-gear-tone.png` + both `zoom-*-gearband.png`: warm two-tone
   band at the exact r4 rect, both sides; medians above.
2. `crops/tell2-drum-faces.png` + `closeup-sprocket/idler.png`: dark face
   sets on-plane, concentric; no pale plates, no bead links.
3. `crops/tell3-turret-rear.png` + `zoom-turret-rear.png` +
   `closeup-turret-rear.png`: proud offset door + ball collar at the ref's
   stations, reading at game distance from every rear aspect.
4. `crops/tell4-deck-pink.png` + `zoom-top-aftdeck.png` + chroma table: the
   mauve batch is measured dead; fittings sit in the hull/turret detail
   families.
5. `crops/tell5-bow-read.png` + `zoom-front-bow.png` + `closeup-bow.png`:
   shelf seams/studs/hooks, headlight assembly, weld dashes, honeycomb
   muzzle, decal removed; cables remain the named residual.

r3 kill item (shade-side material collapse): still dead — re-verified on
the pairs, the sun-opposite hero and the back-lit strip.

## Residuals (named, none gate-holding — the polish list if this print is revisited)

1. **Bow cable contrast** (the surviving sub-item of r4 tell 5): the ropes
   exist at 0.046 with shadow seams and eye blocks, but render near
   contrast-zero against the glacis paint from front/hero angles while the
   ref's bow is dominated by its ropes. The ref's read is ~90% contrast:
   darken the rope tone a step below the glacis and let the twist highlight
   carry. Success test: the cable line resolvable at `pair-front` scale.
2. **Fan wells read flush from top/rear-3/4** (second half of r4 item 5's
   ring ask): de-pinked but value-flat — one well reads as a flush dark
   disc, its twin barely registers, while the ref's two scallop-rimmed
   domes are its loudest deck element. The builder's 3 mm relief ceiling is
   real (gate margin note), but the ref's own domes are near-flush and read
   via rim-vs-well VALUE — a lighter rim ring + darker well floor inside
   the existing footprint would close it with zero silhouette cost.
3. **Wheel pockets louder than the ref's voids:** perfect black circles on
   olive drums vs the ref's subtler star-spoke openwork; reads slightly
   toy-like at garage range (fine at game distance). A mid-dark pocket
   floor (not full black) + faint spoke web would tie it.
4. **Garage-closeup "printed" flatness:** the new door hardware (strap
   hinges/latch) and idler spokes read as flat layered plates at closeup —
   the ref's hinges are shadow-casting blocks. 10-blocker class only.
5. **Top paint ratio 1.14** (builder-documented, materials.js-owned
   up-face response — out of profile scope; inside the ~1.3 gate; m60a1
   passed at 1.11–1.12).
6. **Micro:** honeycomb muzzle bores render lighter than the cap (should be
   dark bores; the ref's bore is dark); proc gear band is cleaner/more
   uniform than the ref's crusty noise; the white pad-wear sparkle peaks
   106 vs the ref's brightest 92 (a few pixels); boxy camo blotches at some
   turntable yaws (shared seed language, accepted since r2); no top-run
   droop between rollers (r3 carryover, certified curves constrain it).
7. Lab notes, not model items: the board hero pair still frames ref/proc at
   slightly different scales (ref bbox family taller — same note as m60a1
   r5 residual 8); my `closeup-bow` pair frames the two bows differently
   because the prints' bow faces sit at different z (the certified gun/
   length oracle residual) — judged at `zoom-front-bow`/`pair-front`
   instead; the proc's visibleBox min.y −0.37 is instanced-geometry bbox
   pollution (ground-anchor frames on y=0, not on box.min).

## Per-component notes

- **Turret:** slab, seams, rivets, handles, slit pads all carry; the rear
  face is now the build's strongest identity fix — door/moat/bolts/straps/
  latch/ball collar at the ref's measured stations, visible dead astern
  exactly where the cheek-wedge occlusion windows allow (the builder's
  measured discovery, confirmed in renders).
- **Gun/mantlet:** collar + bolted disc + cast-seam ring read cast at hero
  range; apron edges still sheet-crisp at closeup only (r4 state, no
  regression); honeycomb muzzle face present; barrel length = certified
  oracle residual (gun 28.3), not counted.
- **Hull/bow:** stepped plates, fender line, tail rake all mask-proven;
  shelf dressed (seams/studs/hooks), headlight assembly present, weld
  dashes in; cables = residual 1.
- **Deck:** de-pinked into the detail families; exhaust domes + ribbed
  intake strips + engine disc read; fan wells = residual 2; spare-links
  board track-dark with pin seams.
- **Running gear:** the r4 component-scale material break is measured dead;
  sprocket/idler face sets on-plane and in-language; links angular
  two-tone; pockets have AO floors (residual 3); band uniformity residual 6.
- **Materials:** one olive batch from all seven directions (1.00–1.14);
  no glowing fittings (raycast-verified); chroma clean.

## The verdict, plainly

r3 failed this tank on a vehicle-wide material catastrophe; r4 failed it on
one hardware material family plus two readability gaps. r5 finds all five
r4 tells dead by their own stated tests — the band measured into the ref's
warm family at 0.92–1.06x, the drum faces machined, the turret rear
furnished at the ref's own stations, the deck measurably pink-free, the bow
dressed — with masks byte-stable, the geometry gate re-verified live at min
90.2, and nothing new anywhere near gate-holding. The remaining list is
polish (cable contrast, fan-well value, pocket tuning), not parity.
**kv2 is the program's second tank to clear both halves of the dual gate:
geometry min 90.2, shaded visual min 9/10.** The fleet recipe (world-
coordinate probes → measured furniture → tone parity by component masks →
independent sun-opposite critique) has now closed two tanks end-to-end.

### Shot inventory (shots/critique-kv2-r5/)

`kv2-board-full.png` (masks 96.27 / min view 94.99 — r4-identical),
`board-hero-pair.png`, `board-articulation.png`, `board-turntable.png`,
`turntable-backlit-7f.png` (7×700 px, yaw 105–195°),
`pair-{front,right,left,rear34,rear,top,hero}.png` (2200×1100 ref|proc
pairs, board lights, r4 framing), `hero-rear-left.png`,
`zoom-{turret-rear,top-aftdeck,front-bow,left-gearband,right-gearband}.png`
(flat ortho pairs, 290–458 px/m),
`closeup-{turret-rear,rear-quarter,mantlet,gear-right,gear-left,sprocket,idler,deck,bow,muzzle,links,garage}.png`,
`crops/tell{1-gear-tone,2-drum-faces,3-turret-rear,4-deck-pink,5-bow-read}.png`
(the r4 rects on this round's pairs), `crops/zoom-hero-glacis.png`,
`fidelity-report.json` (masks — r3/r4-identical),
`geo-report.json` (LIVE gate: min 90.2 PASS, dims 100),
`pair-luminance.json` (view medians/means + band component rows + chroma +
raycast brightest + bbox debug).
Probe rig: `tools/tmp-kv2r5-critic.html` + `.mjs` (untracked, deletable).
