# Shaded-parity critique — round 4, kv2 only (human gate, HANDOFF-FABLE §7)

**Reviewer:** independent shaded-parity critic, 2026-07-31 (round 4).
**Subject:** kv2 after the two r3-response commits: 412399e (fleet shade-collapse
fix in materials.js) and 2e4f158 (wheels/bow-kit/mantlet/deck relief round in
soviet-heavy.js). Geometric gate re-verified LIVE this round: **90.2 PASS**
(hull 92.2 / whole 90.2 / turret 90.3 / stations 95.7 / dims 100 / floaters
100). This round re-judges the visual half of the dual gate with the same
method, azimuths and harshness as r3.

**Evidence (all freshly rendered, own vite on :7461, LOD pinned 0):**
- `tools/procedural-fidelity.html?id=kv2&board=1` full board:
  `shots/critique-kv2-r4/kv2-board-full.png`, native-res board canvases
  `board-hero-pair.png`, `board-articulation.png`, `board-turntable.png`.
- The r3 supplementary rig re-run EXACTLY (same fixed WORLD directions, same
  per-model framing, board lights hemi 1.05 / sun 2.2 @ (30,42,24)):
  `pair-front/right/left/rear34/rear/top.png`, closeups
  `close-turret/mantlet/gear/deck/bow.png`, plus r4 extras
  `close-gear-left.png` (shade-side idler), `hero-rear-left.png` (sun-opposite
  hero) and `turntable-backlit-7f.png` (frames 7–13 sweep).
- Luminance now measured IN-RIG at the same pair cameras, median over tank
  pixels gated by a white-override mask pass: `pair-luminance.json`.
  Method fidelity check: ref left median this round 58.7 — identical to the
  r3 measurement (58.7), so the r3/r4 numbers are directly comparable.
- Machine rows: `fidelity-report.json` (legacy masks unchanged vs r3:
  overall 96.3, hull 96.1, turret 86.6, gun 28.3, tracks 92.3, all 9 views
  95.0–98.6 — no silhouette regressions), `geo-report.json` (gate PASS 90.2).

**Certified residual, not counted (carried from r3):** legacy `gun 28.3` =
the known oracle mismatch (print howitzer z 3.60 vs published-dims muzzle cap
≈3.365). Barrel reads marginally short side-on; identity survives.

## Sun-opposite luminance table (r3 method: median over tank pixels)

| view | ref med | proc med | ratio r4 | ratio r3 | mean-ratio r4 |
|---|---|---|---|---|---|
| front | 59.5 | 56.1 | **1.06** | 1.62 | 1.17 |
| right | 54.0 | 49.8 | **1.08** | 1.34 | 1.12 |
| left (shade) | 58.7 | 57.1 | **1.03** | 3.55 | 1.15 |
| rear34 (shade) | 69.4 | 67.6 | **1.03** | 2.68 | 1.15 |
| rear (shade) | 60.5 | 56.8 | **1.07** | 3.29 | 1.17 |
| top | 54.3 | 47.3 | **1.15** | 1.16 | 1.15 |
| hero | 49.1 | 44.8 | **1.10** | 1.21 | 1.10 |

The r3 headline failure is dead: every view's PAINT median is inside the
~1.3x gate, shade sides included — the builder's 1.02–1.07x claim reproduces
on my rig. Read the median/mean split though: medians say the hull/turret
paint matches, but the mean ratios sit at 1.12–1.17 because ~15% of tank
pixels (track links, cleat/hanger hardware) still render near-black
(lum ≈ 7–15 vs the ref band's 52–63). The collapse fix reached the paint,
not the running-gear material family. Top stays the weakest paint ratio
(1.15 median AND mean — genuinely a touch dark, plus the pink-fitting tell
below).

## Per-view scores

Scale (r3): 9 = "same 3D model at game distance; nothing structural or
material breaks identity", 10 = "indistinguishable at garage closeup".
Gate: ALL ≥ 9. Lower-when-uncertain.

| view | r4 | r3 | one-line verdict |
|---|---|---|---|
| front | 8 | 7 | tone fixed, hooks now forged plates, MG dome reads; but track wraps are black slabs vs rusty links, cables/headlight invisible dead-on, nose shelf face reads as a rounded bumper bar |
| front-3/4 hero | 8 | 8 | mantlet now reads cast at hero range and wheels are pocketed — the two r3 hero tells are closed; the black bead-link row + comb teeth under the fender are what still says "different batch" |
| side (right, lit) | 8 | 7 | wheel pockets/rims read, top run visible; new tells: continuous pale guard-rail line the ref lacks, black ball-shaped links, blank pale sprocket plate, hub-cap idler |
| side (left, shade) | 7 | 5 | paint collapse GONE (1.03x); but the gear band goes full black in shade (band median 15.1 vs ref 55.6 = 3.7x over ~25% of the view) with pale polka-dot wheels — one component still breaks material parity |
| rear-3/4 | 7 | 5 | tone fixed (1.03x), tail door/exhausts/shackles added; turret rear stays flush-engraved, fan rings sub-readable, sprocket = glowing blank plate |
| rear | 7 | 5 | tone fixed (1.07x), tail plate properly dressed now; the dominant surface — turret rear — still reads as a bare wall at distance (flush door, ball invisible), track ends = black venetian slats |
| top | 7 | 7 | plan/layout perfect, domes/rings/intakes now EXIST — but deck-roof fittings render in a warm mauve/pink batch from above (fan well, hatch dome caps, ventilator, intake inserts), one fan ring reads as a pink blob and the other disappears; paint 1.15 |
| articulation strip | 9 | 9 | clean at ±90/180 and −5/+12, sealed mantlet through the sweep, zero floaters; cell-1 shade cell now tonally matched too |
| turntable (24f) | 9 | 9 | coherent full sweep, no popping/floaters; sun-opposite frames hold olive (backlit 7-frame strip confirms — no venetian flash) |

**min view = 7 → FAIL against "every view ≥ 9".**
Identity is now secured from every angle — no view reads as a different
vehicle, and the r3 material catastrophe is fully fixed. What separates 7
from 9 is now ONE material family (running-gear hardware) plus two localized
readability gaps (turret rear face, deck fittings' tone). This is the
narrowest fail of the program so far; every remaining item is
materials/paint-level except one flagged silhouette-mover.

## r3 tell verification (all three, explicitly)

1. **Shade-side material collapse — FIXED.** pair-left/rear/rear34 medians
   1.03/1.07/1.03 (were 3.55/3.29/2.68). Hull side rect medians: ref 60.9 vs
   proc 58.4. The procedural reads as the same olive from every direction,
   including the whole backlit turntable sweep.
2. **Stamped-disc wheels + floating cleat comb — HALF-FIXED.** Wheels grew
   six real pocket voids (read dark on lit side), a rim ring, and the idler a
   spoked face plate; the comb is now hung from a continuous guard rail with
   straps — nothing floats. BUT the fix traded the comb for a FENCE: a pale
   continuous rail line + regular black teeth the ref simply doesn't show
   (`crop-right-gear-proc.png` vs `-ref.png`), and the drum faces went the
   wrong way in tone (below).
3. **Flat-pack mantlet + stripped bow — MOSTLY FIXED.** At the hero camera
   the mantlet now reads as a casting: rounded collar, cast-seam ring on the
   bolted disc, corner fillets, second sleeve step (`board-hero-pair.png`).
   Off-axis the apron still terminates in hard sheet-metal edges mid-face
   (`crop-mantlet-proc.png`) — cast-ISH, not cast, at closeup only. The bow
   kit is genuinely re-hung (both cables + shackles, MG ball dome, gussets,
   forged hook plates — verified in source and on the board) but half of it
   does not READ (below).

## The five worst remaining tells (pixel regions, 2200×1100 pair space)

1. **Running-gear hardware renders near-black** — `tell1-gear-tone.png`;
   `pair-left.png` proc band (x 1150–2150, y 590–810) vs ref (x 60–1060).
   Track links, cleat teeth, hanger straps measure lum ≈ 7–15 under the board
   lights vs the ref band's 52–63 (bottom-run median 15.1 vs 55.6 = 3.7x).
   The r3 fix list asked for "gunmetal"; the result overshot to void-black —
   THIS reference's tracks are rusty-warm. Every side/front/rear view carries
   it; it is the single remaining component-scale material break, and its
   pixels are exactly why the mean ratios (1.15) disagree with the medians
   (1.03).
2. **Blank pale drum faces (sprocket, idler) + bead-shaped links** —
   `tell2-drum-faces.png`; `pair-rear34.png` (x 1420–1720, y 640–870);
   `close-gear-left.png` proc idler (x 1080–1300, y 480–650). The sprocket
   face is a featureless light-steel plate that glows against the black band
   (ref: dark drum, recessed core, integrated teeth); the idler face is a
   pale drum with six small dots (ref: open spoked wheel you can see
   through). Links read as rows of round black balls; ref links are angular
   rusty plates. Three tones (pale steel / black / olive) where the ref has
   one warm family.
3. **Turret rear face still reads bare** — `tell3-turret-rear.png`;
   `pair-rear.png` proc (x 1450–1870, y 250–580) vs ref (x 330–750). The
   flush door seam field + 0.014-deep hinges + shadow-hidden ball do not
   register at game distance; the ref shows a proud framed door plate with
   hinge blocks and a large ball dome. The single biggest surface a pursuer
   sees is still ~80% blank. (The builder's own margin notes prove plan
   budget exists inside the wedge shadow — the ball stub already reaches
   −1.40W. The same budget can carry a proud door plate.)
4. **Deck fittings read as a pink/mauve batch from above** —
   `tell4-deck-pink.png`; `pair-top.png` proc (x 1330–1730, y 130–630).
   Under top sun the fan well, hatch dome caps, ventilator cap and intake
   inserts all take a warm mauve cast: one fan ring reads as a large pink
   blob, its twin disappears entirely, and the two hatch domes read as pink
   C-rings. The ref's same fittings are crisp olive 3D rings. Also here: the
   nose-deck spare-links slab renders as a blank light-grey board
   (`close-turret.png` proc x 1190–1420, y 700–760) instead of track-dark.
5. **Bow kit present but sub-readable** — `tell5-bow-read.png`;
   `board-hero-pair.png` proc glacis (x 800–1220, y 440–770);
   `pair-front.png` proc (x 1270–2030, y 580–920). The two draped cables
   render as faint engraved streaks (no twist/shadow/shackle read — the ref's
   are thick 3D ropes that dominate the bow), the dressed headlight is
   invisible at any distance, and dead-on the nose shelf's smooth rounded
   front face reads as a bolted-on bumper bar. The dashed nose weld line of
   the ref has no counterpart.

Micro (noted, not score-moving): no top-run droop between rollers (r3
carryover); flat muzzle cap vs the ref's honeycomb muzzle face; the turret
rear-left corner stud line wanders (S-curve) at closeup; the proc wears a "2"
decal the reference print does not carry — packet says kept deliberately;
parity-strict it should match the print.

## VERDICT: FAIL — min view 7 (gate requires every view ≥ 9)

Do not read this as r3 redux: the r3 fail was a vehicle-wide material
catastrophe; the r4 fail is one hardware material family plus two readability
gaps. Silhouette work is DONE (geometry gate re-verified 90.2 live this
round; legacy masks byte-identical to r3). Nothing below except item 4
touches silhouette.

### Prioritized fix list for the builder

1. **Retone the gear hardware family (lifts 5 views at once — the r4 twin of
   r3's item 1).** Track links, cleat teeth, hanger straps, guard rail: move
   from near-black (≈0.05 albedo, which materials.js deliberately exempts
   from the ambient floor below ~0.09) into the REF's warm rusty-gunmetal
   two-tone — target band median within ~1.3x of ref 52–63 under the board
   lights, verified on pair-left re-render. Sample the ref GLB's track texels
   for the tone family; "gunmetal" was my r3 wording and it overshot — match
   the oracle, not the word. Materials-only, zero gate risk.
2. **Drum faces: kill the dinner plate.** Sprocket face needs a dark recessed
   core + hub bolt ring + teeth tonally integrated with the rim (currently a
   floating pale plate in front of a black cog ring); idler face needs real
   openwork read — larger/deeper spoke voids in a dark annulus (recess,
   don't extrude: stay inboard of the sprocket carrier-ring width anchors at
   xc+trackW/2+0.045). Face-relief + paint, silhouette-safe if recessed.
3. **Wheel-face language, second pass.** Six small drill-dots → the ref's
   10–12 radial slot voids filling the mid-annulus, hub bolt ring, faceted
   rim band; keep the instanced spin approach (it works — pockets track the
   wheel). Shade-side pockets currently read flat because the voids are
   shallow paint-backed dots; give them AO-dark floors. Silhouette-safe.
4. **Turret rear: make the door a door.** [SILHOUETTE-MOVER — re-run the geo
   gate per edit.] Re-derive the −1.35W plan budget from the ref's own proud
   door face and wedge shadow (the ball stub already proves −1.40W is
   inside the shadow): a 0.02–0.03 proud door plate with hinge blocks +
   latch, and the ball dome grown/forward until it reads from dead astern.
   Curves at the rear quarter must be watched (turret side/plan rows).
5. **De-pink the deck batch + make the rings read.** Move fan wells, dome
   caps, ventilator, intake inserts, engine-hatch studs off the warm/mauve
   bucket into olive/dark-olive; give the fan rings rim-vs-well VALUE
   contrast (dark well, lit olive rim) so both read from top and rear-3/4;
   retone the spare-links slab to track-dark. Also close the top view's own
   1.15 paint ratio (top faces run darker than the ref's — check the
   top-face response in the same materials pass). Materials-only.
6. **Make the bow kit read.** Thicken the cable visual (r 0.03 → ~0.045) with
   a dark twist tone + a painted shadow seam under the run so it separates
   from the glacis (the ref's read is 90% contrast, not geometry); if any
   run can drape the vertical bow face like the ref's, flag it
   [SILHOUETTE-ADJACENT: toe columns + catmull overshoot — the builder's own
   cable-eye blocks exist for exactly this]; brighten the headlight lens +
   verify its crest seat isn't self-occluded; break the nose-shelf bumper
   read with plate seams/bolts on its front face; add the ref's dashed nose
   weld line. Mostly paint.
7. **Small carryovers:** top-run droop hint between rollers (if the certified
   curves allow), honeycomb muzzle face texture, straighten the rear-corner
   stud line, decide "2" decal vs print (parity-strict: remove or match).

Items 1/2/3/5 + most of 6 are materials/paint work with zero gate exposure —
the exact class of change that took left from 5 to 7 this round. The gate
question for r5: does the gear band land in the ref's tone family, and do
the turret rear + deck fittings read at game distance. If yes, every 7 and 8
above has a clear path to 9 — kv2 is one focused materials round away from
joining the dual-gate pass list.

### Shot inventory (shots/critique-kv2-r4/)

`kv2-board-full.png`, `board-hero-pair.png`, `board-articulation.png`,
`board-turntable.png`, `pair-front.png`, `pair-right.png`, `pair-left.png`,
`pair-rear34.png`, `pair-rear.png`, `pair-top.png`, `hero-rear-left.png`,
`close-turret.png`, `close-mantlet.png`, `close-gear.png`,
`close-gear-left.png`, `close-deck.png`, `close-bow.png`,
`turntable-backlit-7f.png`, `pair-luminance.json`, `fidelity-report.json`,
`geo-report.json`, tell crops `tell1-gear-tone.png`, `tell2-drum-faces.png`,
`tell3-turret-rear.png`, `tell4-deck-pink.png`, `tell5-bow-read.png`, plus
working crops `crop-*.png` (left/right gear bands, wheels, bow, mantlet,
turret-rear, top-deck, rear34-deck, hero-glacis — ref/proc twins).
