# pt91m shaded-parity r27 — independent critic verdict (2026-08-03, post-r27 re-cert)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=pt91m` →
shots/critic-pt91m/ (zero console errors; harness carries the certified
pt91m yawOffset:Math.PI page-local patch — r25 rig note, harness-local
class, runtime confirmed unaffected). Profile
src/vehicles/profiles/russia.js md5 e7057709 byte-identical to landed HEAD
f598b08 before and after both renders. `node tools/visual-evaluator.mjs
--id=pt91m` run this round (§D official rig): **rig parity CLEAN, yawProxy
0.1–0.6° all 14 views, no RIG MISMATCH** — scoring valid. Framings
per-half lit-bbox: left 550/550, rear 550/550, top exact 206/206 ×
547/547, front 550/550 (proc top edge −16px = solid mast + crown boxes,
content not scale). Machine gates re-run this round:
`tank-standard-check` gate 91.2 (92.2/91.2/95.1/92.3/100/100), clip
**24/0 ✓** (≤60 band), contig **0 ✓**, decor **mg1+4d ✓**. ITU-601 via
tools/tmp-r7-merkava.py, warm census tools/tmp-pt91m-warm.py; all numbers
below re-derived from THESE pairs (bank law).

## HEADLINE: FAIL — floor 8.6 (top), mean 8.86; 5 of 14 views at the 9.0 bar. NOT a graduation (§10 does not run).

front 8.7 · frontleft 9.0 · left 9.0 · rearleft 8.9 · rear 8.8 ·
rearright 8.9 · right 9.0 · frontright 9.0 · top 8.6 · hero-fl 9.0 ·
hero-rr 8.8 · toptilt 8.8 · close-front 8.9 · close-roof 8.7

This is a large genuine move: r25 floor 8.2 / mean 8.31 → 8.6 / 8.86.
Defect family A (running gear) is FULLY cleared; B is cleared on cheeks/
skirts/accents (deck family remains); C moved from ABSENT to
present-but-compromised; D delivered; E moved from abstract-post to
receiver-mass-without-barrel-read; F unchanged (both declines). Every
score below cites its window; certified residuals drive no score.

## r25 order verification (builder claims re-measured on fresh pairs)

- **Order 1 (running gear) — ALL GATES PASS, verified.** view-left dark
  census x45..460 y330..405 thr25: **0** (was 1861; order ≤200). Wheel
  band x150..520 y355..390: med **55.5** (50–56 ✓) / p5 **51.4** (≥38 ✓)
  / sd **3.65** (≤11 ✓). Rear ramp x45..175 p5 **51.4** (≥40 ✓); front
  idler zone p5 51.4/sd 13.97 vs ref 50.6/10.52. Wheels read dark-ringed
  and recessed at 1x. Honest residuals: band flatter than ref (sd 3.65 vs
  7.41, p95 60.0 vs 70.6) and tire rings neutral-olive where the ref's
  rubber family is warm (view-left gear-zone warm census 1164 vs ref 3499;
  ref rows y≈384 warm, proc cold there) — sub-visible at game scale, noted
  for polish only.
- **Order 2 (warm polarity) — 3/4 verified PASS; the 4th is broader than
  its declaration.** frontright warm census x300..420 y270..330: **0**
  (was 470; ref-class 0 ✓). Front L-cheek x100..280 y255..320 med
  **61.4**/p95 **101.5** (≥58/≥80 ✓; ref 60.9/87.3); R-cheek med 60.5 vs
  ref 60.2 ✓. Skirt band view-left x150..470 y322..352 med **71.4** vs ref
  73.7 (Δ2.3 ≤5 ✓). Top glacis rows x240..400 y370..405 med **56.4** vs
  ordered ≥60 (ref 63.6) — residual confirmed at the declared value, pale
  facets did arrive (p95 70.6 vs r25's 59.9). BUT the deficit is not
  confined to the declared camo-value-split window: grille zone x240..400
  y130..170 med **53.4 vs ref 60.0, sd 2.43** (UNIFORM family tone, not a
  camo split — unchanged from r25's 53.4); mid-deck x240..400 y200..300
  med **55.3 vs 62.3**; hull-edge rows x408..430 y280..360 med **54.4 vs
  59.6** (p5 healed 38.5→47.2). The whole top deck runs 5–7L dark as a
  family; the camo-split declaration covers only the glacis rows.
- **Order 3 (rear drums) — built, hue matched, read partial; census claim
  verified exactly.** Dead-rear x150..490 y305..380 med **72.4**/sd 5.89
  vs ref 68.6/5.85; rowsd gradient parity (4.44 vs 4.99); drum hue samples
  (80,71,58)/(85,75,62) vs ref (80,75,66)/(72,68,59) — family match. Top
  warm cells (256..352,32): **279–297 ≥250 ✓**; cells (·,64): **229/238/
  181/178 vs ordered ≥250 and ref 463–578** — the plan-view warm footprint
  is ~half the ref's (proc 1979 vs ref 3701 warm px in the drum window).
  READ finding (ref-render outranks): dead-rear the proc drums are
  **stepped slab stacks** — three straight seam edges per drum where the
  ref shows a smooth ribbed cylinder with crown-band shading; hero-rr
  shows a genuine round warm end-disc but the body sits **half-buried in
  the green constraint-rail boxes** (ref: full drum train proud of the
  deck); plan shows warm rectangles inside green frames (the rails cap the
  crowns — the direct cause of the row-64 census miss).
- **Order 4 (front kit + MG) — delivered; census green; two read gaps.**
  Smoke banks BOTH cheeks ✓ (view-front proc x~95..120 & x~555..580
  y225..300) — 5 vertical organ-pipe tubes/side vs the ref's 3×4 grid of
  forward-facing tube ENDS (x60..115/x520..575, tube-end circles): bank
  identity present, arrangement visibly different at close-front range.
  lightCluster brush-guards both fender noses ✓. NSVT →
  FITTINGS.pintleMG cls nsvt ✓ (census mg1+4d): dark receiver+ammo
  two-box cluster at the correct cupola seat (turret-local +0.55,−0.56;
  receiver top 1.92 at the ref's 1.931 line), ~25L below the dome —
  reads as equipment mass, MG-PHYSICS polarity correct. **The ordered
  30–45px crown-riding barrel run does not read**: close-roof proc seat
  window x540..640 y320..400 has **4 sub-45px vs ref MG window 60** — the
  0.57 m barrel blends within ~8L of the dome (elev 0.10 tucks the muzzle
  under the housing cover by design). view-rear crown: ref's NSVT
  dominates the skyline; proc rear crown reads **gunless** (dome + mast +
  roof box only). view-top plan: no legible gun (ref cupola+gun read
  visible).
- **Order 5 (containment) — VERIFIED.** `track-clip-audit --exact` via
  standard-check: **24/0** (≤60 band; was 178/220). Gate held 91.2 PASS
  (whole +0.5 over r25).
- **Order 6 (polish) — verified delivered except frame-read.** Cold-blue
  glass census (B>R+8): **0 px** on close-front and view-front proc (blue
  dashes gone, olive glass ✓). OBRA hero-fl left-rail lump pair: gone
  (slim strip reads continuous) ✓. Basket post-rhythm slats: visible as
  serration at close-roof only — 1.5 mm proud is sub-half-pixel in the
  550px views, so view-rear x200..440 y240..300 still reads slab (med
  67.0/sd 10.18 vs ref 71.7/8.61); the r25 ask was a *frame read* in
  standard views — partial.

## Standing checks (§B owner laws + §D/§H)

- FRONT SLOPES: **PASS** — evaluator front view 25 matched edges, zero
  glacis-class findings (flags are 0.09–0.35 m crown-furniture edges
  Δ1.8–3.3°, several at the ±4° corner-bias floor = no-finding; left-view
  crown line Δ2.6–3.5° on 0.8 m roof-box runs, sub-visible at 1x).
- NO EMPTY AREAS / TURRET HOLES: **PASS** — machine contig 0; evaluator
  proc voids are the under-barrel sky-window class (hero-rr 0.647 m² at
  world (−0.86,1.77,0.68) = triangle bounded by tube / far deck rail /
  new far-cheek smoke tubes — inspected, benign; ref carries the same
  window un-enclosed).
- DECORATION MINIMUM: **PASS** — mg1+4d machine census (pintleMG NSVT +
  2 smoke banks + 2 light clusters); NSVT read critique carried above as
  score, not as a §B3 violation.
- TRACK CONTAINMENT: **PASS** — 24/0 (tow-eye tori grazing band end-cap
  dilation, documented residual class).
- VARIANT-DISTINCTIVENESS (§H.4) vs t72b3m (built lineage comparator):
  **PASS, clear tells** — pt91m: full-height ERAWA cassette skirt wall,
  vertical smoke-tube banks on BOTH cheeks, transverse rear fuel drums,
  SAVAN staircase + boxy crown, front-left mast; t72b3m: exposed
  road-wheel run with soft front skirts, K5 wedge cheeks, Sosna-U
  open-frame sight, bare rear deck, cupola MG. No re-badge read at any
  shared view.

## Judgment on the declined-with-reason items

1. **Crown-air (front x100..540 y150..228 ≥63%)** — measured **55.6% vs
   ref 67.0%** (unchanged from r25's 55.7). The decline reason
   (1.95–2.10-band boxes own front gate columns; needs a front-column
   decode round) is legitimate engineering, but the residual is VISIBLE
   at 1x in the identity view: the proc crown reads as a near-continuous
   box ridge right of the dome where the ref skyline is airy. It holds
   view-front under the bar — decline accepted as scheduling, not as
   certification.
2. **Dome tile-arc seams** (plan-poke risk) — decline reasonable for the
   round budget; the smooth-ellipse dome remains clearly visible in
   top/toptilt/close-roof vs the ref's faceted wedge. A decal-class
   tone-only seam set (dark hairline arcs pinned ON the dome surface, no
   new geometry, §C decals-are-mask-geometry note) is the suggested
   thread-the-needle for r28.
3. **Top-glacis med 56.4 (camo value-split class)** — the declaration is
   honest for the glacis rows, but does NOT cover the top view's read:
   the grille/mid-deck/hull-edge windows show a uniform-family 5–7L
   deficit (sd 2.4 — not camo-split). The deck FAMILY needs a lift; see
   order 1.
4. **Drum row-64 warm census (shaded-arc under R>55)** — honest about the
   arc shading, but the zoom shows the green rail frames capping the drum
   crowns in plan; the warm footprint is half the ref's. Fixable inside
   the certified envelope; see order 2.

## Per-view justifications (deductions cite windows; certified residuals not scored)

- **view-front 8.7** — crown air 55.6% vs 67.0% (box-ridge skyline at 1x,
  the one surviving r25-F front item); banks both cheeks now (organ-pipe
  vs tube-end grid, minor at 550px); cheeks at/above ref parity (camo
  splotches punchier, sd ~2× ref — in-window); guards ✓; gear ✓.
- **view-frontleft 9.0** — gear family clean, skirt parity, ERAWA
  neutral-olive with pale facets, drums read fine at this distance;
  cassette pale-pop mild. At the bar.
- **view-left 9.0** — r25-A at its loudest is now silent: census 0,
  wheels recessed, ramps fade correctly; skirt Δ2.3; crown-line Δ2.6–3.5°
  sub-visible. At the bar.
- **view-rearleft 8.9** — drums present (warm, placed right) but read as
  flat warm patches inside green frames from this quarter; basket band
  slab-dark (Δ~5L). One read-class step from the bar.
- **view-rear 8.8** — dead-rear drums are stepped slab stacks (3 straight
  seams/drum) vs ref's smooth ribbed cylinders — the view's identity
  feature at 1x; rear crown gunless where the ref's NSVT dominates;
  basket band med 67.0 vs 71.7. Tone/mass/notch all correct.
- **view-rearright 8.9** — as rearleft; right cassette course now clean
  (warm census 0 in the r25 window).
- **view-right 9.0** — mirror of view-left; cassette row neutral, gear
  clean. At the bar.
- **view-frontright 9.0** — the r25-B loudest view is clean (470→0 warm);
  banks visible; flap warm band present (377 px vs ref 1552 — lighter,
  sub-visible at 1x). At the bar.
- **view-top 8.6 (floor)** — deck FAMILY 5–7L dark across grille
  (53.4/60.0, unchanged since r25), mid-deck (55.3/62.3), hull edges
  (54.4/59.6); glacis rows 56.4 vs the ≥60 order; drum plan warm
  footprint halved by rail-frame capping (row-64 cells ≤238 vs ≥250
  order, ref 463+); dome smooth ellipse (declined); MG invisible in plan.
  Two explicit r25 done-gates miss in this view; layout/silhouette parity
  itself is excellent.
- **hero-frontleft 9.0** — perspective volume good; OBRA lumps gone;
  SAVAN staircase + banks + gear all read; crown ridge softer at this
  angle. At the bar.
- **hero-rearright 8.8** — THE drum view: round warm end-disc genuine,
  but the body half-buried in green rail boxes vs ref's proud drum train;
  wheel dishes now read recessed ✓; under-barrel enclosed sky window
  benign.
- **hero-toptilt 8.8** — smooth dome ellipse prominent at tilt; deck
  family tone visible; basket rails slab (slats sub-pixel); drums read
  partially round here; accents/tracks clean.
- **close-front 8.9** — glacis tone parity (med 65.8/67.4, r25 banding
  gone), wheels detailed, guards+glass ✓; bank arrangement difference at
  its most visible range (organ pipes vs tube-end grid ~60×70px);
  cassette pale-pop p95 103.5 vs 87.8.
- **close-roof 8.7** — the ref's hero item (NSVT) answers with a correct
  dark receiver+ammo mass but NO legible barrel (4 vs 60 sub-45px in the
  seat windows; ordered 30–45px run absent); dome smooth at the closest
  range; SAVAN staircase, "312" decal, serrated basket rim, ERAWA arc
  tiling all genuinely good.

## Fix orders for r28 (each cites its done-gate; smallest set that clears the floor)

1. **TOP-DECK FAMILY LIFT (+ clears top; helps toptilt).** The engine-deck/
   grille + mid-deck plate family is a uniform 5–7L dark (NOT the declared
   camo-split class — sd 2.4). Clone-lift the deck-plate family only
   (t72b3m run-lift/clone-material law; NOT hullTrack — the skirt wash the
   r27 builder measured and reverted). Done-gates on view-top proc:
   grille x240..400 y130..170 med ≥58; mid-deck x240..400 y200..300 med
   ≥60; hull-edge x408..430 y280..360 med ≥57; NO skirt regression
   (view-left skirt band med Δref ≤5 stands); glacis rows re-measure —
   if still <60 after the family lift, the camo-split declaration is
   accepted as final for the rows.
2. **DRUM READ COMPLETION (clears rear family + top warm).** (a) Plan:
   pull the green rail frames' footprint off the drum crowns (or re-hue
   the crown-visible rail tops to the drum wood family) so top warm cells
   (256..352,64) ≥250 each (ref 463+) — stay inside the certified hump
   envelope (side staircase, station-0 width, plan −3.37, ±0.107 notch).
   (b) Dead-rear: soften the three step seams per drum (proc-half
   x190..300 & x350..460, y305..375) — tone/AA-blend class first (rowsd
   parity already; the seams are the tell), geometry bevel only if it
   stays off the −3.37 col law. Done-gate: dead-rear constant-y runs2
   count in the drum band materially reduced; hero-rr drum body reads
   proud of the rails (eyeball + this verdict's zoom method).
3. **MG BARREL READ (clears close-roof; helps rear/front skylines).**
   Darken the pintleMG barrel/receiver line family (or add the dark
   crown-line decal per §C) so close-roof shows a ≥30px connected sub-45
   run from the receiver over the dome; nudge elev/muzzle so a gun-class
   silhouette prints in the view-rear crown band at the cupola x-band
   (ref's NSVT owns that skyline). Pintle allowance ≤0.4 gate pts (§C)
   still applies. Done-gates: close-roof proc x540..640 y320..400 ≥40
   sub-45px including one ≥30px run; view-rear crown gun read present at
   1x.
4. **CROWN AIR (clears front; declined-carryover).** Front-column decode
   round per the r27 decline note, or the partial: stagger/narrow ONLY
   non-column-owning boxes in the 1.95–2.10 band (commander shelf/sight
   head class). Done-gate: view-front rectbg x100..540 y150..228 air
   ≥60% (ref 67.0; full order remains ≥63).
5. **POLISH (no-regression budget).** (a) Cassette pale facets −½ notch
   (front-cheek p95 stays ≥80; skirt p95 target ≤85 vs ref 80.6).
   (b) Basket frame read in standard views: slat gaps to ~4–5 mm or dark
   slot decals — view-rear x200..440 y240..300 gains vertical rhythm
   (watch rear column ownership). (c) Optional: tire-ring hue toward the
   ref's warm rubber family within the passed luma window; dome hairline
   arc-seam decals (declined-item 2 thread-the-needle).

Gate-margin note: orders 1, 3(tone), 5(a,c) are tone/decal class
(mask-invisible); order 2(a) re-hues or re-seats INSIDE the certified
envelope; orders 2(b)-bevel, 3(elev), 4 and 5(b) can touch geometry —
land with gate ×2 + fresh pairs + hash proof; any geometry edit
invalidates this verdict per §G (expected — this is a FAIL round).

Law notes for the bank: (a) a "camo value-split" residual declaration
must carry an sd/per-row check — a uniform-family deficit (sd ≤2.5)
is a retone order, not a camo artifact; (b) constraint-rail assemblies
that keep certified extremes can EAT the read of the round bodies they
guard — plan/quarter zooms of the rail-vs-body boundary belong in the
builder's own done-gates; (c) sub-half-pixel "rhythm" details satisfy a
frame-read order only at close range — orders that say *standard views*
need ≥1px-at-550px features.
