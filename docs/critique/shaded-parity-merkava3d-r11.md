# merkava3d shaded-parity r11 — independent critic verdict (2026-08-03)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=merkava3d` →
shots/critic-merkava3d/ (14:23, zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` merkava3d = 966f6fd0 (the r11 packet hash) BEFORE and
AFTER render; official gate re-run on my watch: 90.7 PASS (91.5/90.7/91.6/
92.3/100/100) — exactly the r11 landing record; no 3d anomaly (sibling
working-tree edits are casemate/misc/uk only, merkava.js clean at HEAD
3ef76d7). Measurements: the builder's own official sweep
(tools/tmp-r11-verify.py) re-run on MY fresh pairs, plus my independent
windows (tools/tmp-critic3d-r11-measure.py), ITU-601 + mask-method
maxch ≤13 throughout. Zoom crops (tools/tmp-critic3d-crop.py) are
diagnosis-only; all verdict numbers are official-rig.

BINDING ARBITRATION (post-r11, packet bottom) — respected throughout:
(1) hero-rearright corner backing STAYS; view judged on overall read,
corner-sky % must not floor it. (2) close-roof 626-class warm census is
the certified material floor; deck warm-census grinding is out of order —
relief/structure critique remains fair.

## HEADLINE: FAIL — floor 8.6 (close-front), mean 8.85 (r9 8.78; fifth rise)

front 9.0 · frontleft 8.9 · left 8.8 · rearleft 8.8 · rear 8.9 ·
rearright 8.8 · right 8.8 · frontright 8.9 · top 9.1 · hero-fl 8.8 ·
hero-rr 8.8 · toptilt 8.9 · close-front 8.6 · close-roof 8.8

The floor is NOT an r11 regression: it is the fleet-wide TRACK
CONTAINMENT owner law (GEOMETRY-GATE §B4, ratified 2026-08-03, after the
r9 verdict) which critics now carry on every verdict. Everything r11 was
ordered to do, it did — and every measured claim in its packet section
reproduced EXACTLY on my fresh renders.

## r11 claims audit (§D discipline: CLEAN — all headline claims reproduce)

Re-run of the official verify sweep on my pairs, builder claim → my read:
1. view-front turret warm zone: claimed 46 (order ≤~57) — **46 EXACT**
   (ref 1). Maroon ring ellipses dead; nothing warm reads at 1x. PASS.
2. view-rear under-rim p5: claimed 82.4 (order ≥72) — **82.4 EXACT**
   (ref 82.5, parity). PASS.
3. Crown air: claimed 76.4% (order ≥80, ref 87.2) — **76.4 EXACT**;
   skyline steps claimed 23 (order ≥6) — **23 EXACT** (ref 29). PARTIAL
   as declared; the parapet ruled line is dead, see view-rear below.
4. Dome lids: **VERIFIED** — close-roof and toptilt show shaded cap
   volumes; r9's "flat dashed circles" read is dead. Residual concentric
   ring+seam line grammar remains (certified caps limit crown to
   rg.top+0.020), see order 5.
5. Louvre: claimed sd 7.0 (order ≥6) — **sd 7.0 / p75 97.1 / p95 102.8
   EXACT** (ref 8.3/99.7/107.2). PASS.
6. Declared partials all reproduce: rearleft under-rim 66.6 (order 85),
   rearright 63.6 (order 70), rear-face sub-70 census 672 (order ≤300,
   ref 25), rear-face p95 99.3 (order 104-106), center bay med 94.4
   (ref 98.4), hero-rr corner air 27.5 (certified), arch row p5 29.5 /
   p95 67.2 + skirt band p5 60.8 (unchanged, honest miss).
No claim failed to reproduce. This is the cleanest claims sheet the
program has audited on this tank.

## Standing checks (§B, incl. the two NEW fleet-wide checks)

- **TRACK CONTAINMENT: FAIL** — `track-clip-audit --exact` merkava3d
  front **208** / rear **143** voxels (band ≤~60; family context:
  graduates 3b 315/727, 3c 303/718, queued for their own rounds).
  Offender is rig_hull (206 front / 120 rear). RENDER READS: close-front
  shows dark shoe teeth crossing the bow plate / splash-flap line at 1x
  (both wraps; worst on the mudflap diagonals), and the fender-corner
  wrap tops read as exposed brown steps; rear teeth read at the wing
  plate bottom edge from the rear quarters (2-3x). r11 touched no
  nose/tail/wheel geometry — this is a pre-existing condition surfaced
  by the new law, and it floors close-front (order 1).
- **CONTIGUITY: PASS** all 14 views at 1x + 10 zoom crops — no floating
  masses, no see-through voids at any verdict angle; the r9 orphaned
  sliver stays fixed. Machine caveat: standard-check finds a 2-cell
  enclosed top-down hole at (x 0.24, z −4.38) in the tail rack band —
  sub-visual (both halves carry ref-class open tail slots there; my
  mask sweep of the visible band x215..425 y47..75 reads air 21.0% proc
  vs 19.1% ref, same class), but holes=0 is required for §10. Order 7a.
- **DECORATION: PASS-with-partial** — MGs present (crest M2, plinth MG,
  right .50, loader) and READ per MG PHYSICS where it counts: official
  freesky scanner on my pairs: M2 runs 50px L / 48px R @ lum 84/70
  (two-tone class; ref's own 64/64 @ 82/78), main gun 141px both,
  plinth float 7px @ gap 5 (ref class 13px). Pale-deck inversion
  (top-down dark footprints) is delivered as MASS but not FORM: the .50
  plate is a solid near-black rectangle (291 sub-78px where the ref
  deck is bare), the M2 chip (146px) doesn't read as a gun, loader 10px
  invisible — order 6. Machine caveat: KIT.fittings census reads mg0+0d
  (all guns hand-authored r3-r7, predating the library) — §I requires
  migration or a packet justification; routing item 7b.
- FILL/CIRC: CIRC PASS (rings round, plan circles circular); FILL PASS
  with the arch-pocket residual (order 2).

## Per-view justifications (fresh renders; deltas vs the r9 verdict)

- **view-front 9.0** (8.8) — the two r9 deductions are dead: warm 46 px
  (was 346 "maroon ellipses"), and the M2 cluster now reads dead-front
  in the opened crown window. Crown skyline broken. Remaining class
  items only: turret-face floors darker than ref (zone p5 66.2 vs 74.2,
  med −4.7), band row y208..218 med 82.1 vs 91.9, bow furniture sparser
  than ref's headlight cluster. Meets the bar.
- **view-frontleft 8.9** (8.9) — still the best quarter; silhouette,
  band tone, gun furniture in class. Held under 9.0 by the under-skirt
  dark curtain (G) reading through the arch row and the certified band
  boxiness (treatment order 2 + the extents cert).
- **view-left 8.8** (8.8) — hull band med parity 94.4 exact; tail rail,
  shelf runs, tip stow all hold. Wheel row is the loudest ortho defect:
  proc is a FLAT-56 curtain (p25=med=p75=56.0) with near-black pockets
  p5 29.5 and NO pale wheel faces (p95 69.3 vs ref 94.5) — ref shows
  five pale dished wheels; ours read as silhouettes. Bow teeth 2-3x.
  Order 2 targets exactly this window.
- **view-rearleft 8.8** (8.7) — under-rim bar improved 56.3 → 66.6 but
  still a 1x dark line in a strip the ref keeps bright (ref p5 102.6;
  beyond p5 the strip is near-parity — it is a thin slot, order 3).
  Corner texture packed-vs-airy (certified direction). Arch curtain
  visible from this angle too.
- **view-rear 8.9** (8.7) — the round's headline win: crown parapet
  BROKEN (air 66.7 → 76.4, steps 23, the ruled 216-line dead), under-rim
  p5 82.4 = ref parity, wing faces re-polarized to 672 sub-70 (was
  1274). Held under 9.0 by the declared partials: air still −10.8pp
  under ref (the cupola/.50 crown cluster block, order 4), face census
  2.7x the order target, center bay med 94.4 vs 98.4 flat.
- **view-rearright 8.8** (8.7) — as rearleft with the smaller under-rim
  gap (63.6 vs ref 79.0); warm rail bits dead; wing-crate faces read
  slightly slabbier from this side.
- **view-right 8.8** (8.8) — as view-left: med parity everywhere that
  matters, wheel row curtain (p95 63.2 vs ref 87.2, med flat 60.1),
  muzzle ring + sleeve read well.
- **view-frontright 8.9** (8.8) — the r9 "warm plate" is dead; now
  matches frontleft class. Same G deduction.
- **view-top 9.1** (9.0) — best view. Mottle sd parity (5.77 vs 5.71),
  mid-deck med parity (85.4 vs 86.4), louvre ribs restored (sd 7.0),
  warm bar dead (587, certified floor), tail slot grammar ref-class,
  zero sky cells in the visible tail band. Debits are zoom-class only:
  field p95 relief cap (90.6 vs 96.8), the .50 black box, M2 chips.
- **hero-frontleft 8.8** (8.6) — domes, curb hairline, de-warmed rails,
  M2 all land; the band wall still reads tall-flat-bright vs ref's
  swept wedge (wall med 85.6 vs 93.8, p5 66.3 vs 77.7) with sticker
  items (inset window outline, tick marks). Extents are certified —
  order 5's wall-wash component is the remaining treatment lane.
- **hero-rearright 8.8** (8.8) — judged on OVERALL read per arbitration
  1: mass, stowage richness, fringe chains, crate lit-face parity
  (p75/p95 111.9/112.9 vs ref 111.6/113.2) are all strong; corner reads
  packed-pale vs ref's airy lattice (certified residual, not floored);
  crate shade-faces carry −13L dark slots; antenna reads fat-dark vs
  ref hairline. Corner air 27.5% recorded, not scored.
- **hero-toptilt 8.9** (8.9) — domes now shade as volumes; deck rich;
  louvre present. Held under 9.0 by the ink-class dark grammar (the
  hard dark diagonal stick, near-black vent boxes — order 5), the
  residual concentric ring+seam lines, and gun footprints that read as
  chips from above (order 6).
- **close-front 8.6** (8.8) — THE FLOOR, and it is the containment law:
  at this range the bow wrap teeth visibly cross the splash-flap /
  lower-glacis line and the fender-corner wrap tops sit exposed (§B4
  render read; audit 208 front). The rest of the view holds its r9
  class (chevron tone-on-tone, towLit eye plates, skirt fronts, muzzle;
  bow furniture still sparser than ref's headlight cluster + diagonal).
  Fix order 1 and this view returns to ~8.8-8.9 on its other merits.
- **close-roof 8.8** (8.6) — mauve dead (626 = the certified material
  floor; NOT re-ordered per arbitration 2), domes in, louvre in. The
  remaining gap is STRUCTURE, which stays fair game: the deck reads
  CAD-planar vs ref's cast sculpture (fwd-roof plane sd 5.83 / p95 87.1
  vs ref 7.48 / 98.4 — no soft swells, no pale relief crowns) and the
  dark grammar is ink-class — sub-60 census 9209 vs ref 4086 (2.25x):
  hard-black vent rectangle, 4-domino strip, long hairline conduits.
  Orders 5+6.

## Fix orders for r12 (coordinate-level; certs respected)

1. **TRACK CONTAINMENT (§B4, unlocks the floor).** Clear the bow wrap
   from the bow plate/mudflap solids and the stern wrap from the wing
   plates: pull the wrap-arc proud-depth in at the sprocket/idler tops
   or seat the plates proud with real clearance — builder's choice, but
   the audit must read ≤~60 per zone (target 0) via
   `node tools/track-clip-audit.mjs --exact --ids=merkava3d`, and the
   close-front bow must show NO teeth crossing the plate line at 3x.
   Nose dims carriers (body 2.89 / boards 2.90 / pods 3.055) and the
   certified wrap-arc curve content are gate-priced — verify gate hold
   90.7-class x2 before/after. r11 did not cause this; r12 must clear it.
2. **Wheel-row polarity (G, both orthos).** Keep the med-56 parity
   (certified), add the missing tonal ends inside the arch windows:
   pale dish/rim highlight lane on the six wheel faces (the ref's own
   pale-wheel read) and lift the near-black arch-ceiling pockets.
   Verify (my windows): view-left x150..450 y392..425 p5 ≥45 / p95 ≥85
   (ref 52.9/94.5; now 29.5/69.3); view-right x190..490 same rect
   p5 ≥42 / p95 ≥80 (ref 46.7/87.2; now 43.2/63.2). Tone-only behind
   the skirt line = silhouette-free.
3. **Under-rim slot fillers (B completion).** The quarter-angle recess
   between the wing rail hairline (wg.top−0.012) and the rolled-stow
   crowns (wg.top−0.014) still reads as a dark slot. Fill per-bay with
   pale chocks/straps topping at wg.top−0.005 (below the wing top line,
   silhouette-free; do NOT raise over wg.top — the wings carry dims
   band content). Verify: view-rearleft x70..210 y340..354 p5 ≥85
   (ref 102.6); view-rearright x430..570 y340..354 p5 ≥70 (ref 79.0).
4. **Crown air completion (C, refund-class).** The residual solid is
   the cupola/.50 crown cluster (view-rear x_img 160..199, +210px vs
   ref) plus ~30px of M2-cluster excess: lower the .50 ammo can below
   the receiver crown, slim the receiver/plate z-depth, and thin the M2
   cluster edges ~10-15px/side — all where the ref rim falls (r4
   elevated-cam refund class). Verify: view-rear y195..232 air ≥80%
   (ref 87.2), steps stay ≥20, under-rim p5 stays ≥80.
5. **Deck ink→shade + cast relief (close-roof/toptilt structure; warm
   census NOT in scope per arbitration 2).** (a) Retone the dark line/
   box family riding 45-60L — bay diagonal stick, near-black vent
   rectangle, the 4-domino strip, long conduit hairlines — to the ref's
   60-75L soft-shadow class and break the diagonal into segments.
   (b) Add 2-3 low cast swells / rx-NEGATIVE washes (r11 deck-tilt sun
   law) on the big fwd-roof plane and one on the hero-fl band wall.
   Verify: close-roof sub-60 census ≤6000 (ref 4086; now 9209);
   fwd-roof plane x120..350 y360..450 p95 ≥93 + sd ≥6.5 (ref 98.4/7.48);
   hero-fl wall x330..560 y250..300 med ≥89 (ref 93.8).
6. **Gun-FORM footprints (F-ii completion).** Reshape the top-down dark
   plates from abstract blocks into receiver+barrel gun lines at the
   SAME certified tops: .50 zone (view-top x374..392 y270..330) from a
   291px solid rectangle to a ≤150px gun-shaped line; M2 chip (146px)
   extended into a receiver+barrel line reading toward the ref's own
   485px gun-window form; loader MG from 10px to a visible 60-100px
   line. No new silhouette columns (r4 MASK-NODE law).
7. **Process items (orchestrator routing, not view-scored).**
   (a) Close the 2-cell enclosed top-down hole at (x 0.24, z −4.38)
   with a sliver filler under the rack members — standard-check
   holes=0 is a §10 precondition. (b) mg0+0d fittings census: the guns
   are hand-authored (r3-r7, predate KIT.fittings) and are measured
   ref-parity instruments — recommend a packet §I justification over
   migration (migration risks the certified free-sky runs); owner call.
   (c) 3b/3c graduate containment (315/727, 303/718) already queued per
   the e1dbcea routing — not this lane's work.

PROTECT (verified this round, do not regress): warm floors 46/587/626;
crown steps 23 + broken parapet; under-rim rear p5 82.4 parity; louvre
sd 7.0; M2 free-sky 50/48px two-tone; plinth float; dome volumes;
mottle/med parity top+sides; module plan edges; hem scallops; chevron;
towLit plates; rear p95 highlight rows.

Gate margin note: orders 2/3/5/6 are tone/sub-silhouette (refund-class
or free); order 4 is refund-class where the ref rim falls; order 1 is
the only geometry-priced item — it gets the gate-hold x2 protocol.

## Verdict

FAIL at floor 8.6 — one view, one cause: the new fleet-wide TRACK
CONTAINMENT owner law reads at 1x in close-front (audit 208/143 vs the
≤~60 band). Eleven of fourteen views sit 8.8-8.9, top at 9.1, front at
9.0; every r11 claim reproduced exactly; both arbitration certs held.
This tank is ONE containment fix + a tone/relief round from the
graduation bar — not graduation-track this round: §10 does not run.
