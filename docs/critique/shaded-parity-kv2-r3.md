# Shaded-parity critique — round 3, KV-2 only (human BUILD-STANDARD review)

**Reviewer:** independent shaded-parity critic, 2026-07-31.
**Subject:** kv2 — the first tank to pass the full geometry gate
(docs/geometry-gate/kv2.json: min 90.1, re-verified live this round:
hull 91.8 / whole 90.1 / turret 90.3 / stations 95.8 / dims 100 / floaters 100).
This round judges the SECOND half of the dual gate: does the build read as the
same vehicle at the same asset tier in SHADED renders.

**Evidence (all freshly rendered, own vite on :7433, LOD pinned 0):**
- `tools/procedural-fidelity.html?id=kv2&board=1` full board:
  `shots/critique-kv2-r3/kv2-board-full.png` (masks + metrics + hero pair +
  articulation strip + 24-frame turntable), native-res board canvases
  `board-hero-pair.png`, `board-articulation.png`, `board-turntable.png`.
- Supplementary shaded pairs at fixed WORLD directions with the board's exact
  lights (hemi 1.05 / sun 2.2 @ (30,42,24)), per-model framing:
  `pair-front/right/left/rear34/rear/top.png`, closeups
  `close-turret/mantlet/gear/deck/bow.png`, tell crops `tell1..tell5-*.png`.
- Machine rows: `fidelity-report.json` (legacy masks: overall 96.3, hull 96.1,
  turret 86.6, gun 28.3, tracks 92.3; every one of the 9 views 95.0–98.6),
  `geo-report.json` (gate PASS 90.1).

**Method note — why this round sees things r1/r2 could not:** the board's hero,
articulation and turntable cameras all sit on the SAME side as the sun
(camera dir ≈ (0.75,0.32,1), sun ≈ (30,42,24)); every past shaded cell was a
lit cell. The supplementary pairs sample the sun-opposite faces the game shows
constantly. Both models were rendered in one scene with identical lights, so
every tone delta below is a material property, not a lighting choice. The
page's own articulation strip confirms the effect at cell 1 (ref pale,
procedural dark) — it is not an artifact of the supplementary rig.

**Certified residual, not a defect:** legacy `gun 28.3` is the known oracle
mismatch — the print's howitzer reaches z 3.60 while published dims cap the
dims-100 build's muzzle at ≈3.365 (see kv2.md v10-r3 cert). The barrel reads
marginally shorter side-on; identity survives. Not counted below.

## Per-view scores

Scale: 9 = "same 3D model at game distance; nothing structural or material
breaks identity", 10 = "indistinguishable at garage closeup". Gate: ALL ≥ 9.
Lower-when-uncertain.

| view | score | one-line verdict |
|---|---|---|
| front | 7 | silhouette + bolted disc carry it; bow stripped of ref's signature clutter, hooks read as bollards, tone −0.7 stop |
| front-3/4 hero | 8 | best view: seams/rivets/slab all read; flat-pack mantlet + stamped wheels are the tier tells at hero range |
| side (right, lit) | 7 | slab + seams good; wheels read as stamped discs, cleat fringe reads as a floating comb, idler a bare drum |
| side (left, shade) | 5 | material collapse: median luminance 13.6 vs ref 58.7 (3.55x) — a black cutout next to a painted vehicle |
| rear-3/4 | 5 | tone collapse (2.7x) + deck missing its round fan rings; intakes read as flat bars; MG ball unreadable |
| rear | 5 | worst combined: 3.3x darker; turret door = faint engraving vs ref's framed door + ball; tail = flat plate w/ 2 dots |
| top | 7 | plan + deck layout right; roof furniture flush/inked vs ref's domed hatch + ventilator; deck rings absent |
| articulation strip | 9 | clean: seats at ±90/180, mantlet sealed through −5/+12, zero floaters/voids (r1 failure mode stays dead) |
| turntable (24f) | 9 | fully coherent sweep, no popping/floaters; note it structurally cannot exercise shade faces (see method) |

**min view = 5 → FAIL against "every view ≥ 9".**
(r2 categories for continuity: SD 7, MA 4, WT 6, TC 7, HC 7, SP 9, OV 6 —
silhouette way up from r2's 7, materials DOWN from r2's 5.)

## Per-component notes

**Hull.** Envelope certified and it shows: stepped driver plate, nose shelf,
fender line, tail rake all sit exactly on the print in every mask (95–98.6).
Plate seams + rivet rows read on glacis and hull top edge (rivets stop at the
fender line again — the r2 ask to continue along the pannier seam is still
open). Bow kit REGRESSED vs the r2-era build documented in
docs/references/tanks/kv2.md: the two draped tow cables w/ shackles are GONE,
fender gussets no longer read (one faint tab vs the ref's 3 bright triangles
per side), hull MG ball is a flat dot, headlight+horn are plain boxes, and the
four gate-anchor tow-hook brackets render as oversized rounded BOLLARDS at the
toes (ref shows small hook slivers at the same stations). Deck: round engine
hatch is a barely-visible engraving, mesh intakes read as flat stacked bars,
the ref's two big round fan rings have no counterpart at all, twin tail
exhausts are two faint dots on a flat tail plate.

**Turret.** The slab itself is the build's best asset: width/height/chamfer
dead-on, engraved plate seams + rivet studs along edges, "2" decal, vision-slit
pads and side-handle nubs present (sub-readable), rear MG stub present. The
rear face is a tier down: the ref's framed, hinged DOOR + MG ball dome read as
faint engraved rectangles + a dotted circle. Roof: two flush hatch rings + pods
exist but are ink-flat next to the ref's domed hatch, periscope pods and
ventilator bump.

**Gun/mantlet.** Mechanically excellent (sealed through the whole articulation
sweep). Visually the assembly is a flat-pack: rectangular outer frame, boxy
collar, single-step recoil sleeve, three stacked chin boxes — the ref renders a
CAST horseshoe with a curved seam sweeping around the tube root. Same stations,
different manufacturing language, at the exact hero camera. Barrel overhang
slightly short (certified residual, leave).

**Gear (wheels/tracks).** The biggest regression from r2, which credited kv2
with "fleet-best" real spoked wheels. The v10 build's wheels are shallow
stamped discs: flat face, three small triangular notches near the hub, thin
bright rim, no through-spoke depth, no polygonal rim character; the front
idler is a completely bare drum (ref idler is openly spoked). The 16+6
width-anchor cleat nubs read as a floating comb of teeth hanging under the
fender the whole hull length, and they hide the actual top track run. Bottom
run links/pads/horns are decent and the two-tone rusty track matches the ref's
tone family. No sag on the top run (ref droops slightly between rollers).

**Materials.** The failed component this round. Under the identical board
lights, measured over tank pixels only: hero 1.21x darker than ref, top 1.16x,
right 1.34x, front 1.62x — and on sun-opposite faces the procedural collapses:
left 3.55x (median 13.6 vs 58.7), rear 3.29x, rear-3/4 2.68x. The reference
(same stripBakedTextures camo canvas!) holds readable olive from every
direction; the procedural turns into an unlit black cutout whenever the viewed
face isn't toward the sun. This is an albedo/ambient-response (likely
metalness/env) property of the procedural material set, and it single-handedly
holds three views at 5. Secondary: wheel faces and fittings share the hull
albedo (ref wheels read as a distinct steel tone), and the r2 mismatch-log item
"track gunmetal needs a materials.js change" is now in scope.

## The three worst tells (pixel regions)

1. **Shade-side material collapse** — `tell1-shade-tone.png`;
   `pair-left.png` procedural cell (x 1180–2150, y 300–950) vs reference cell
   (x 80–1050, y 300–950); same on `pair-rear.png` right half and
   `pair-rear34.png` right half. Median tank luminance 13.6 vs 58.7 under one
   light rig. Every surface feature the builder shipped disappears into it.
2. **Stamped-disc wheels + floating cleat comb** — `tell2-wheels.png`;
   `close-gear.png` procedural wheel row (x 1120–2140, y 560–1090) vs reference
   (x 60–1040, y 560–1090); also `pair-right.png` (x 1010–2190, y 620–1010).
   Flat triangle-notch faces, bare-drum idler, and the evenly-spaced nub fringe
   reading as a decorative comb rather than track hardware.
3. **Flat-pack mantlet + stripped bow** — `tell3-mantlet.png` and
   `tell5-bow.png`; `board-hero-pair.png` procedural mantlet (x 800–1380,
   y 100–540) vs reference (x 60–640, y 120–560); `close-bow.png` procedural
   bow (x 1270–2010, y 380–760). Picture-frame mantlet vs cast horseshoe;
   missing cables/gussets/ball dome; bollard-shaped tow hooks.

## VERDICT: FAIL (min view 5; gate requires every view ≥ 9)

Geometry is done and locked — nothing below asks for a silhouette change. The
gap to PASS is materials + surface relief readability.

### Prioritized fix list for the builder (readability/material only)

1. **Material ambient response (fixes 3 views at once).** Bring the procedural
   material set's off-sun response to the reference's: raise diffuse albedo /
   kill metalness-without-envmap / add hemisphere gain so shade-side median
   luminance lands within ~1.3x of the ref (verify against pair-left /
   pair-rear re-renders, not the hero). Then close the lit-face gap (currently
   1.2–1.6x dark) so the two paints read as one batch. The r2 "out of scope"
   materials.js note is exactly this round's scope.
2. **Wheel-face relief pass (restores the r2-tier gear read).** Same outline,
   new faces: deep 6-pocket spoke voids w/ AO-dark depth, polygonal rim
   highlight, hub bolt ring; spoke the front idler face; give wheel/roller
   faces the steel tone split from hull paint; darken track toward gunmetal
   (ref two-tone) and add a hint of top-run droop between rollers if it stays
   inside the certified curves.
3. **De-comb the width-anchor cleats.** Keep the gate-anchor geometry, repaint
   it: cleat nubs to track/guard dark tone and tie them to a thin guard strip
   so they read as track guard hardware, not floating teeth; let the real top
   run show above the wheels.
4. **Re-hang the r2 bow kit the rebuild dropped:** two draped tow cables with
   shackles across the glacis, 3 triangular fender gussets per side, dome the
   hull MG ball, lens + bracket the headlight, and reshape the four tow-hook
   anchors from rounded bollards into hook profiles (their 0.42-tall band
   columns at x ±0.52 are gate-relevant — keep the band, shape the top).
5. **Deck + rear signatures:** emboss the two round fan rings on the rear deck
   (a few cm of relief + bolt ring is enough to read at top/rear-3/4), dark
   mesh material in the intake frames, readable twin tail exhaust bores (flush
   with the tail face per the r2 mismatch log — dark bore + rim, no z growth),
   raise the turret rear door frame + MG ball dome relief.
6. **Mantlet dressing inside the locked silhouette:** chamfer/round the outer
   frame corners, add the curved cast seam around the tube root, second step on
   the recoil sleeve, keep the bolt ring emphasized.
7. **Small carryovers:** continue hull rivet rows along the pannier seam (r2),
   slight dome relief on roof hatch rings + ventilator, verify "2" decal
   placement/side against the print.

Re-render the board AND the six fixed-direction pairs after items 1–3; the
gate question for r4 is whether left/rear/rear-3/4 climb from 5 to 9 on
material response alone plus the gear pass.

### Shot inventory (shots/critique-kv2-r3/)

`kv2-board-full.png`, `board-hero-pair.png`, `board-articulation.png`,
`board-turntable.png`, `pair-front.png`, `pair-right.png`, `pair-left.png`,
`pair-rear34.png`, `pair-rear.png`, `pair-top.png`, `close-turret.png`,
`close-mantlet.png`, `close-gear.png`, `close-deck.png`, `close-bow.png`,
`tell1-shade-tone.png`, `tell2-wheels.png`, `tell3-mantlet.png`,
`tell4-deck.png`, `tell5-bow.png`, `fidelity-report.json`, `geo-report.json`.
