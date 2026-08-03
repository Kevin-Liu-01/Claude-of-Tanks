# pt91m shaded-parity r25 — independent critic verdict (2026-08-03, FIRST round)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=pt91m` →
shots/critic-pt91m/ (13:5x, zero console errors). Profile
src/vehicles/profiles/russia.js md5 f5b941b3 byte-identical to landed HEAD
8126c9f before AND after both renders — no sibling (r26) interference, no
gate anomaly. ITU-601 + MASK-METHOD via tools/tmp-r7-merkava.py; warm-hue
census via tools/tmp-pt91m-warm.py (merkava3d R>G+3 ∧ R>55 method, temp,
delete after round). Framings verified per-half lit-bbox: left 550/550w,
top exact, rear 550/550, front 550/550 (proc top edge −16px = solid mast vs
ref's sub-threshold antenna rows — content, not scale). All numbers below
derived from THESE pairs.

## RIG NOTE (blocking discovery, fixed in the official harness)

The FIRST render of this round produced pairs with the REFERENCE yaw-180
vs the procedural (ref gun/glacis −z, mirrored flanks). Root cause: the
recovered print is authored −z-forward (pt91m.md oracle note); the GATE
toolchain auto-flips it (tools/vertex-extract.mjs flip check → `X=-X,
Z=-Z`), but the runtime loader honors only `cfg.yawOffset`
(modelLoader.js:2288) and userdrops5.js `source('pt91m', …)` registers
none. tools/tmp-tank-critic.html now carries a page-local pt91m
yawOffset:Math.PI patch (same class as its existing leo2a6 override; never
ships). Pairs were re-rendered on the OFFICIAL driver after the patch; only
the re-rendered set is scored. **Orchestrator flag:** the same missing
yawOffset means local in-game builds resolve the pt91m GLB visual
un-flipped through the identical createTank path — worth a lane-correct fix
(src edit is outside the critic's permissions).

## HEADLINE: FAIL — floor 8.2, mean 8.31 (first round; gate needs ≥9.0 every view)

front 8.4 · frontleft 8.3 · left 8.2 · rearleft 8.2 · rear 8.3 ·
rearright 8.3 · right 8.3 · frontright 8.3 · top 8.5 · hero-fl 8.4 ·
hero-rr 8.2 · toptilt 8.4 · close-front 8.2 · close-roof 8.3

Silhouette/stance/dims are excellent everywhere (the vertex rounds show);
every deduction below is shaded-material / read class, which the mask gate
does not price. The r25 certified residual set (heightM-trade col ≈3px,
muzzle-band bottoms ≤2px, row2 corners) is **not visible at game scale**
and drives no score — honored as certified.

## Standing checks (§B owner laws)

- FRONT SLOPES: **PASS** — glacis rakes 1.50→1.247 with the ref's fall,
  nose plateau reads correctly in left/hero views.
- NO EMPTY AREAS / TURRET HOLES: **PASS** — machine contig 0
  (`tank-standard-check`), top/tilt visual sweep clean; ERAWA wall, SAVAN
  stack and basket all read attached (support wedges do their job).
- DECORATION MINIMUM: **FAIL** — machine census `mg0+0d ✗`: the NSVT is
  hand-authored (`nsvt()` helper), zero KIT.fittings markers, and it does
  not READ as a gun (defect E). Flat rear panel + clean right cheek also
  under-dressed vs ref kit density.
- TRACK CONTAINMENT: **FAIL** — `track-clip-audit --exact`: front 178 /
  rear 220 voxels vs the ≤~60 kv2-graduate band (offender rig_hull both
  zones — the r25 fade strips and LEFT skid sit inside the wrap volumes).

## Defects (all windows re-runnable on these pairs)

**A. RUNNING-GEAR SHADED CLASS, proc-only black (9+ views).** The
two-layer track renders near-BLACK with saw-tooth horn contrast; the 17
gear-fade strips read as detached black stair-blocks; wheels read
pale-flat. view-left gear band x45..460 y330..405 thr25 dark census:
**proc 1861 sub-25px vs ref 0** (worst cells (93,346) 79px, (397,346)
95px). Wheel band x150..520 y355..390: proc med 58.9 / p5 6.8 / sd 17.95
vs ref med 51.7 / p5 50.6 / sd 7.41 — ref wheels are DARKER than deck and
sit in arch shadow; proc's are paler than the hull with black teeth mixed
in. Rear ramp x45..175 y330..400: proc p5 6.8 vs ref 50.6 (ref fades, proc
stair-steps). Front idler zone x360..455 y330..400: proc p5 6.8 / sd 21.52
vs ref 50.6 / 10.52. Same signature in every side/quarter/hero and
close-front.

**B. ERAWA/DECK WARM-DARK POLARITY (7 views).** Tile fields
(hullTrack/turretTrack: glacis rows, cheek walls, skirt plates) render
warm dark-brown where the ref's tiles are neutral olive with pale top-lit
facets. view-frontright warm census: proc cheek cell (352,288) **470 warm
px** vs ref cheek-class max 129; proc cassette row y384 cells 103-151 each.
view-front L-cheek x100..280 y255..320: proc med 55.6 / p95 75.1 vs ref
60.9 / **87.3** (missing pale facets); R-cheek 53.2/68.3 vs 60.2/76.2.
Whole proc deck runs 5-8L dark vs ref (top view: grille zone x240..400
y130..170 med 53.4 vs 60.0; glacis rows y370..405 med 56.3 / p95 59.9 vs
63.6 / **77.1**; hull-edge rows x408..430 y280..360 med 53.4 / p5 38.5 vs
59.6 / 51.8). Meanwhile the ref's LEGIT warm family is missing from proc:
skirt lower rubber band + flaps (ref frontright warm cells (192..288,352)
494-692; proc cold there) — skirt band x150..470 y322..352 view-left: proc
med 63.8 vs ref 73.7 (−10L).

**C. REAR DRUM IDENTITY ABSENT (5 views).** The ref rear is DOMINATED by
two ribbed brown fuel drums (dead-rear two circles x150..490 y305..380;
top-view warm cells (256..352, 32..64) 351-578 px each; hero-rr round
volumes with end caps). Proc carries the box humps + strips only — tone
parity is fine (drum-zone med 71.8 vs 68.6) but the READ is a flat wall:
rear lower panel x160..480 y400..500 proc sd 3.99 vs ref 5.79 and no
circular shading anywhere. REF-RENDER OUTRANKS ROW ANALYSIS: the r9 "hump"
decode measured the drums' mask, the render shows cylinders.

**D. FRONT IDENTITY KIT MISSING (3 views).** Ref carries ~2×5
vertical-tube smoke batteries OUTBOARD BOTH cheeks (ref front x60..115 &
x520..575 y225..300, tube ends p95 86.3) and round headlight brush-guards
on both fender noses; proc has two thin tubes right-only, no left bank, no
guards (only 4-6px steel-blue glass dashes at the periscope/light spots,
proc front (282..300, 292..305) class — an odd cold accent the ref lacks).

**E. MG READ (MG PHYSICS) FAIL (roof axis + skylines).** close-roof: ref
NSVT window x350..450 y245..305 is 72% lit (28% sky through the gun!) with
a legible barrel/receiver/drum and 60 sub-45 contrast px; proc window
x335..375 y300..340 is 100% lit, med 52.7, one dark blob cell (335,300)
43px — an abstract post, no 30px+ barrel run, no receiver mass; invisible
from view-top and weak on the front/rear skylines. Pale-deck law says dark
crown-riding LINES; blob ≠ line.

**F. CROWN SKYLINE + DOME PLAN READ.** view-front crown band x100..540
y150..228 (MASK-METHOD rectbg): ref air **67.0%** vs proc **55.7%** — the
1.95-2.10 band right of center is a ruled box row (right roof box,
commander shelf, sight head, basket/hump tops). Plan/tilt: proc dome is one
smooth lathe ellipse + specular; ref reads a faceted wedge with visible
tile-arc seams (top x255..380 y185..320). Minor: OBRA bracket reads as two
black lumps on the left rail at hero-fl (pair ~(718..732, 286..294)).

## Per-view justifications

- **view-front 8.4** — stance/width/ERAWA wall/mast all in class; smoke
  banks under-read (D), crown air 55.7 vs 67.0 (F), glacis tile banding
  warm-dark (B), no headlight guards (D), track faces black (A).
- **view-frontleft 8.3** — gear class fully visible (A: black saw band,
  strip wedges, pale wheels); skirt −10L + tile warm (B); bow corner
  staircase reads squared vs ref's swept fender (minor, certified extents).
- **view-left 8.2** — A at its loudest: 1861-vs-0 dark census, detached
  stair-strips both ramps, pale-flat wheels; skirt band −10L (B). Hull/
  turret/gun proportions superb.
- **view-rearleft 8.2** — A + no drums (C) + flat rear wall; basket reads
  slab not frame.
- **view-rear 8.3** — drums absent (C), lower panel texture-flat (sd 3.99
  vs 5.79), crown box row (F); band tone meds otherwise parity.
- **view-rearright 8.3** — as rearleft plus the right cassette course reads
  warm-dark panel row (B).
- **view-right 8.3** — A (pale discs + black saw + cassette row); skirt
  tone (B).
- **view-frontright 8.3** — B at its loudest (470-vs-129 warm cheek), A,
  right-only smoke tubes (D).
- **view-top 8.5** — machine contig ✓, plan silhouette/asymmetries right;
  deck 5-8L dark with warm strip accents (B), dome smooth vs wedge (F), no
  drums at the rear deck (C), MG invisible (E).
- **hero-frontleft 8.4** — perspective volume present and good; A + B; OBRA
  lumps (F); SAVAN staircase attached and reads well.
- **hero-rearright 8.2** — C (ref's drums own this view) + A (exposed rear
  wrap saw) + flat rear wall; wheel dish volume absent vs ref's deep
  dishes.
- **hero-toptilt 8.4** — B deck accents, F dome read, basket slab vs ref
  pipe-frame, no drums (C), track saw edge (A).
- **close-front 8.2** — D (banks + guards at close range), B glacis
  banding, A black tooth clusters with bg air between them, blue glass
  dashes; saddle/sleeve/tube contour good.
- **close-roof 8.3** — E (no gun read at the range where ref's NSVT is the
  hero item), box-pile roof vs ref cast texture, warm ring seams (B);
  SAVAN raked staircase + number decal genuinely good.

## Fix orders for r26+ (refund order — each clears a family of views)

1. **RETONE THE RUNNING-GEAR FAMILY (A; clears left/right/4 quarters/2
   heroes/close-front).** Tone-only, gate-neutral: (a) track pads+chain to
   the ref's 45-62L olive-brown (horn-vs-pad delta ≤12L, kill the black);
   (b) the 17 fade strips from near-black to shadow-olive 40-48L —
   geometry/footprints untouched (they own ramp gate columns); (c) wheels:
   dark tire ring ≤45L + darkened dish so the row reads recessed (ref
   class: wheels DARKER than hull). Done-gates on view-left: dark census
   x45..460 y330..405 thr25 ≤ 200; wheel band x150..520 y355..390 med
   50-56 / p5 ≥ 38 / sd ≤ 11; rear ramp x45..175 y330..400 p5 ≥ 40.
2. **SWAP THE WARM POLARITY (B; clears front/frontright/top/toptilt/
   close-front + skirt rows everywhere).** ERAWA tile + deck-strip family
   → neutral olive (R ≤ G−2) with pale top-lit front facets; give the warm
   brown BACK to the rubber family (skirt lower band, flaps). Done-gates:
   frontright warm census x300..420 y270..330 ≤ 200 (ref class); front
   L-cheek med ≥ 58 / p95 ≥ 80; top glacis rows y370..405 med ≥ 60; skirt
   band view-left med Δref ≤ 5L.
3. **BUILD THE REAR DRUMS (C; clears rear/rearleft/rearright/hero-rr/top/
   toptilt).** Two ribbed cylinders in the brown family INSIDE the
   certified hump envelope (tops ≤1.735, rear faces ≤ −3.37 body line,
   |x| 0.2..1.1 — the columns the humps already own; keep the −2.892
   center notch clear). Done-gates: dead-rear x150..490 y305..380 shows two
   cylinder gradients; top warm cells (256..352, 32..64) ≥ 250 px each;
   gate line x2 unchanged (hull/whole/stations).
4. **FRONT KIT + MG (D+E; clears front/close-front/close-roof/top +
   §B3 machine gate).** (a) KIT smoke banks 8-10 tubes OUTBOARD both
   cheeks inside turret AABB; (b) lightCluster brush-guards on both fender
   noses; (c) migrate NSVT → `FITTINGS.pintleMG({cls:'nsvt'})`-class
   fitting with receiver MASS + 30-45px barrel run (dark crown-riding on
   the pale deck, pale where sky-backed per MG PHYSICS), fixing the
   `mg0+0d ✗` census. Pintle silhouette allowance ≤0.4 gate pts (§C).
5. **TRACK CONTAINMENT (§B4 machine gate, gate-blocking).**
   `track-clip-audit --exact` front 178 / rear 220 → ≤60 each (target 0):
   the wrap diagonals intersect rig_hull solids — pull the strip boxes'
   x-width off the wrap band (x ±1.36 w 0.50 spans the full track width;
   thin toward the outer face) or lift wrap clearance; re-run audit + gate
   x2 (strips own ramp columns — verify no mask drift).
6. **POLISH (no-regression budget).** Crown air front x100..540 y150..228
   ≥ 63% by staggering/narrowing non-column-owning box faces only; tile-arc
   seam hairlines on the dome plan (tone-only) to break the smooth ellipse;
   basket top-rail → visible post rhythm (frame read); slim the OBRA lump
   pair; drop the steel-blue glass dashes to olive-glass.

Gate margin note: orders 1-2 are pure tone (mask-invisible); order 3 lives
inside already-priced envelopes; order 4 adds within §C fitting law; order
5 is the one geometry-touching order and MUST land with gate x2 + fresh
hash proof. Any geometry edit invalidates this verdict per §G — expected;
this is a FAIL round with a mandatory rebuild of the critic pairs after
r26.
