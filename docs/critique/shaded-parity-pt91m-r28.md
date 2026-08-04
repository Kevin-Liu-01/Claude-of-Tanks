# pt91m shaded-parity r28 — GRADUATION critic verdict (2026-08-03, post-r28)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=pt91m` →
shots/critic-pt91m/ (zero console errors; harness carries the certified
pt91m yawOffset:Math.PI page-local patch — r25 rig note, harness-local
class). Profile src/vehicles/profiles/russia.js md5 4a46fafa byte-identical
to landed HEAD 26956e1 before and after both renders (and my fresh proc
half is byte-identical to the builder's committed evidence crop in
shots/russia-r28/ — deterministic rig, trust anchor). `node
tools/visual-evaluator.mjs --id=pt91m` run this round (§D official rig):
**rig parity CLEAN, yawProxy 0–0.5° all 14 views, no RIG MISMATCH** —
scoring valid. Framings per-half lit-bbox: left 550/550, rear 550/550, top
exact 206/206 × 547/547, front 550/550 (proc top edge −14 px = solid mast
+ crown content, improved from r27's −16; content not scale). Machine
gates re-run this round: `tank-standard-check` gate **91.3**
(93/91.3/95/92.8/100/100 — every component ≥90), clip **24/0 ✓** (≤60
band), contig **0 ✓**, decor **mg1+4d ✓**. ITU-601 via
tools/tmp-r7-merkava.py, warm census tools/tmp-pt91m-warm.py, connected-run
audit by 8-conn component analysis (scratchpad, method in text); all
numbers below re-derived from THESE pairs (bank law).

## HEADLINE: **GRADUATION PASS** — floor 9.0, mean 9.01; ALL 14 views at or above the 9.0 bar. §10 runs.

front 9.0 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.0 · frontright 9.0 · top 9.0 · hero-fl 9.1 ·
hero-rr 9.0 · toptilt 9.0 · close-front 9.0 · close-roof 9.0

r25 floor 8.2 → r27 floor 8.6 → r28 floor 9.0. All five r27 orders
delivered on their own done-gates or delivered-partial under a binding
column cert (order 4). The five r27 ≥9.0 views show no regression (windows
re-verified below). Every residual that remains is named, and every one is
either inside its declared window, a certified gate residual, or a
documented optional decline — none is bar-holding.

## r27 order verification (builder claims re-measured on fresh pairs)

- **Order 1 (top-deck family lift) — ALL THREE DONE-GATES PASS.**
  view-top proc: grille x240..400 y130..170 med **59.6** (≥58; ref 60.0,
  was 53.4) / mid-deck x240..400 y200..300 med **60.7** (≥60; ref 62.3,
  was 55.3) / hull-edge x408..430 y280..360 med **60.4** (≥57; ref 59.6 —
  proc now above ref). NO skirt regression: view-left band x150..470
  y322..352 med **71.8** vs ref 73.7 (Δ1.9 ≤5; r27 was Δ2.3). Glacis rows
  **56.4** (<60, unchanged by design) → per the r27 verdict's own written
  rule, the camo value-split declaration is **FINAL for the rows**
  (certified residual, drives no score). close-front glacis parity
  protected as claimed (med Δ≈1.8 in my spot window; z>2.04 exclusion
  worked). Honest residual: proc grille noisier than ref (sd 3.77 vs
  1.82, p5 51.5 vs 56.8) — sub-visible texture at 550 px.
- **Order 2 (drum completion) — all three prongs PASS.** (a) Plan warm:
  row-64 cells (256/288/320/352,64) = **464/454/322/311, all ≥250**
  (ordered ≥250 each; were 238/229/181/178; ref 463–578); row-32 cells
  506/489/388/384 at/above ref; total drum-window warm **3344 vs ref
  3701 = 90%** (r27 was 53%). (b) Dead-rear: constant-y edge runs ≥12 px
  in the drum bands x190..300 & x350..460, y310..375: proc carries ONLY
  the y=310 band-edge run that the ref carries identically — **in-band
  extra runs 0 = ref's 0** (r27's three stepped-slab seams per drum are
  gone). Zone x150..490 y305..380 med **73.5**/sd **5.53** vs ref
  68.6/5.85 (Δ+4.9, inside the ±5 family window); rowsd 5.11 vs 4.99
  parity. (c) hero-rr: drum bodies + round end discs stand **proud** of
  the dropped 1.52 cradle rails (eyeball + zoom method; the r27 green
  burying frames are gone — rails re-bucketed to the drum family read).
  Honest residual: proc drums run a shade lighter and read panel-stepped
  at 2× zoom where the ref's are darker smooth crown-banded cylinders;
  at 1x both read as warm ribbed drum cargo — in-window.
- **Order 3 (MG read) — both done-gates PASS.** close-roof proc x540..640
  y320..400: **98 sub-45px** (≥40; was 4; ref half 1 in the same rect —
  its MG sits elsewhere in frame) including a **34 px connected run**
  (≥30) — re-derived independently by 8-conn component analysis: comp
  n=74 spanning x557..590 y320..323. view-rear crown: **gun-class
  silhouette present at 1x** — dark muzzle-up barrel + flash hider with
  receiver mass at base, gun-steel clone tone against the pale crown (MG
  PHYSICS polarity correct). The ref/proc side mirror of the gun about
  the crown centerline is the r25/r27-adjudicated correct cupola seat
  (turret-local +0.55,−0.56; receiver top 1.94 vs the ref's 1.931 line)
  — seat certified two rounds running, not re-litigated. Bonus verified:
  dark crown line reads in view-top plan; dark receiver cluster reads at
  the front-view crown.
- **Order 4 (crown air) — DELIVERED-PARTIAL, CERT AUDITED AND BINDING.**
  view-front rectbg x100..540 y150..228 air **58.6%** (packet-exact; ref
  67.0%; r27 55.6%; done-gate was ≥60). Column cert audit on the fresh
  pair (per-column first-content tops, proc vs ref, flag = proc taller
  >3 px): every flagged run falls INSIDE the certified bands — x147..200
  + x285..435 + x461..487 (drum crowns v≈1.95 = the order-2 protagonists,
  crest bar/posts/sliver, station-i0/side-staircase carriers), x206..231
  (the 2.19 heightM crest — dims-sovereign), x237..277 (2.146/2.119 fwd
  slabs at side-col-pinned z), x280..282 (mast station-i5) — EXCEPT two
  de-minimis classes: x203..204 (2 cols, 9 px, the staircase-cluster edge
  sliver in the 5-px gap between certified bands — boundary bleed of
  certified owners, ~0.006% of window air) and window-bottom shoulder
  lines x100..139 / x489..509 (Δ4–10 px at y217+, cassette/cheek-shoulder
  roofline at the rect floor — silhouette-height class priced by dims
  100, not skyline boxes; ~0.6% air total). **No uncovered protagonist —
  the cert HOLDS and the accepted bar for this item is the cert + 58.6%.**
  1x skyline READ: the r27 "near-continuous box ridge right of the dome"
  is broken — genuine sky separates mast, dome, and right boxes; the
  left-of-center crest cluster remains blockier than the ref's slim
  NSVT pedestal but every owner is gate-pinned. The remaining 1.4% to
  the ≥60 gate is the scheduled rear-stack x/z re-decode (r27-crown-air
  scheduling class — accepted).
- **Order 5 (polish) — delivered; one optional item declined again.**
  (a) Cassette −1 notch: front L-cheek med **61.5**/p95 **92.9** (≥58/
  ≥80 ✓; p95 was 101.5, ref 87.3), R-cheek 62.5/89.6 (ref 60.2/76.2);
  skirt band p95 **84.5** (≤85 target ✓). (b) Basket frame read at
  550 px: view-rear x200..440 y240..300 med **70.4** vs ref 71.7 (Δ1.3;
  r27 was 67.0/Δ4.7); the seven 3 px slat verticals read as rhythm at 1x
  (and as rim serration at toptilt/close-roof). (c) Tire rings one hue
  step warm at held luma: view-left gear-zone warm census **2099** (was
  1164; ref 2582 in my x45..520 y330..405 window — direction and
  magnitude right, ~81% of ref); every r27 gear luma gate re-verified
  EXACT: dark census x45..460 y330..405 thr25 **0**, wheel band med
  **55.5**/p5 **51.4**/sd **3.23**, ramp p5 **51.4**. Dome arc-seam
  decals: declined again (optional item, plan-poke risk over budget) —
  residual carried in top/toptilt/close-roof notes below, non-blocking.

## Standing checks (§B owner laws + §D/§H)

- FRONT SLOPES: **PASS** — the glacis-class edges match unflagged (0.8 m
  lower-left/right front edges Δ0.4–0.7°); all front flags are
  0.09–0.39 m crown-furniture edges (worst Δ−13.2° on a 0.19 m box edge
  at y 2.06 — sub-visible), several at the ±4° corner-bias floor =
  no-finding. Left-view 0.48 m glacis-top edge Δ+3.2° ≈ 2 px sag —
  no-finding. Noted: one 0.82 m roof-box run at Δ+7.3° (y 2.11, the
  reworked crest line) ≈ 8 px over the run — crown-furniture class, not
  silhouette identity; left profile p95 Δtop 0.098 m unchanged from r27.
- NO EMPTY AREAS / TURRET HOLES: **PASS** — machine contig 0, §B2 hole
  scan 0; evaluator voids: hero-rr 0.606 m² = the r27-inspected benign
  under-barrel sky window (ref carries the same window un-enclosed);
  0.052/0.009/0.005 m² are track-fender / under-hull slit class at the
  silhouette boundary — inspected, benign (ref carries equivalents
  between its wheels).
- DECORATION MINIMUM: **PASS** — mg1+4d machine census (pintleMG NSVT +
  2 smoke banks + 2 light clusters); the NSVT now READS in four views
  (close-roof barrel run, rear crown silhouette, top plan line, front
  receiver cluster) — MG PHYSICS pale-deck polarity correct via the
  order-3 gun-steel clones (law note b class).
- TRACK CONTAINMENT: **PASS** — 24/0 (≤60 band; tow-eye tori end-cap
  dilation, documented residual class).
- VARIANT-DISTINCTIVENESS (§H.4) vs t72b3m (built lineage comparator):
  **PASS, tells strengthened** — side-by-side proc halves: pt91m =
  full-height ERAWA cassette skirt wall, vertical smoke-tube banks BOTH
  cheeks, transverse rear fuel-drum train (now the loudest rear tell),
  SAVAN staircase + boxy crown, front mast; t72b3m = exposed road-wheel
  run with soft front skirts, K5 wedge cheeks, Sosna-U open-frame sight,
  bare rear deck + unditching log, cupola MG. No re-badge read at any
  shared view.
- r27's five 9.0 views NO-REGRESSION: **verified** — skirt Δ1.9 (was
  2.3); frontright r25-B warm window x300..420 y270..330 **0 = ref 0**;
  gear gates exact (above); frontleft/left/right/frontright/hero-fl
  eyeballed clean; the only r28 changes touching them are tone lifts
  that track the ref (deck family, tires) and the crown shaves (which
  only lower proc content toward the ref line).

## Per-view justifications (deductions cite windows; certified residuals drive no score)

- **view-front 9.0** — crown air 58.6% under the audited binding cert
  (residual columns all gate-pinned; last 1.4% = scheduled rear-stack
  decode); 1x skyline no longer a continuous ridge (air between mast/
  dome/right boxes); cheeks at/above parity (L 61.5/92.9 vs 60.9/87.3
  after the −1 notch); banks read on both cheeks (organ-pipe vs the
  ref's tube-end grid — minor at 550 px, unordered residual class);
  gear/guards/glass ✓. At the bar.
- **view-frontleft 9.0** — untouched 9.0 class; deck family now tracks
  ref, drums peek warm at the rear corner; cassette pop reduced. Holds.
- **view-left 9.0** — every r27 gear gate re-verified to the decimal;
  skirt Δ1.9; tires warm 2099 (~81% of ref, was 33%); crown roof-box
  edge Δ+7.3°/0.82 m noted as furniture class. Holds.
- **view-rearleft 9.0** — both r27 causes delivered: drum train reads as
  one proud warm mass (frames gone), basket band Δ1.3 with slat rhythm.
  Residual: drum family a shade lighter than ref's dark brown (Δ+4.9,
  in-window). Up from 8.9.
- **view-rear 9.0** — the three r27 deductions all answered on their
  gates: stepped-slab seams gone (in-band runs 0 = ref 0), rear crown
  carries a gun-class silhouette at 1x, basket band 70.4 vs 71.7 with
  readable verticals. Residuals: drums lighter/panel-stepped at zoom
  (in-window; 1x reads ribbed drum cargo), right-of-mast box cluster
  blockier than ref (certified rear-stack class). Up from 8.8.
- **view-rearright 9.0** — as rearleft, mirror; cassette course clean.
  Up from 8.9.
- **view-right 9.0** — mirror of left; drum end disc warm at the rear.
  Holds.
- **view-frontright 9.0** — r25-B warm window stays 0 = ref 0; banks
  visible; tires warmer toward ref. Holds.
- **view-top 9.0 (was floor 8.6)** — all five r27 plan items closed:
  deck family delivered (59.6/60.7/60.4 vs gates 58/60/57), drum plan
  warm 90% of ref with all row-64 cells ≥250, MG dark crown line legible
  in plan, glacis rows certified-final (camo split), layout/silhouette
  parity excellent (was already). Residual: the smooth-ellipse dome +
  rounded planform vs the ref's faceted wedge — the twice-declined
  OPTIONAL seam-decal item; gate-priced (turret 95) and sub-0.2 class
  at 1x. Clears the bar.
- **hero-frontleft 9.1** — the strongest view: perspective volume,
  SAVAN staircase, banks, gear, deck tone tracking, warm drum corner —
  all read; crown ridge soft at this angle. Above the bar.
- **hero-rearright 9.0** — THE ordered drum view delivered: bodies +
  end discs proud of the 1.52 cradle (r27 burying frames gone); wheel
  dishes recessed; under-barrel void certified-benign. Residual: drum
  body panel-step read vs ref's smooth cylinder at this range. Up
  from 8.8.
- **hero-toptilt 9.0** — deck family + drum masses + basket serration
  all delivered at tilt; accents/tracks clean. Residual: smooth dome
  prominent at tilt (declined optional). Up from 8.8.
- **close-front 9.0** — cassette pale-pop fixed at the ordered value
  (92.9 vs ref 87.3); glacis parity protected; wheels/guards/glass ✓.
  Residual: bank internal arrangement (organ pipes vs tube-end grid) at
  its most visible range — unordered residual, sub-0.15 class, now the
  view's only live item. Up from 8.9.
- **close-roof 9.0** — the view's identity item delivered: dark 34 px
  connected barrel run + receiver mass over the dome (98 sub-45 px vs
  r27's 4); "312" decal, staircase, serrated basket rim, ERAWA arc
  tiling all read. Residual: smooth dome at closest range (declined
  optional); cassette front-course cards read flat-pale at the raking
  angle (reduced from r27). Up from 8.7.

## GRADUATION (explicit): §10 runs in the same commit

Per BUILD-STANDARD §G + GEOMETRY-GATE §10 (incl. the 2026-08-03
amendment), the orchestrator executes for pt91m:
1. Retire userdrops5 source('pt91m') + SOURCED_IDS entry.
2. Icons: 5-only + restore.
3. Packet freeze + hash (docs/references/tanks/pt91m.md; profile md5
   4a46fafa at 26956e1 is the certified state — hash-freeze from there).
4. Registration + yawOffset:Math.PI mirrored into ALL THREE override
   maps: tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES,
   tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES, AND
   tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES (the §D
   evaluator aborts on graduates without it).
5. Archive shots/visual-eval-pt91m/ + shots/critic-pt91m/ as this
   verdict's evidence before any re-run.
ANY geometry edit from here invalidates this verdict (§G) — pt91m is
hash-frozen after §10; family-rig adoption only via a graduate-change
round (§H.3).

Post-graduation wishlist (non-blocking, for a future graduate-change or
family round): (a) dome hairline arc-seam decals (the r27
thread-the-needle — twice declined on plan-poke budget, still the right
fix); (b) drum family a half-notch darker inside the ±5 window + rib
lines to trade the panel-step read for the ref's ribbed cylinder; (c)
bank tube-end grid read at close-front; (d) rear-stack x/z re-decode to
buy the last 1.4% front crown air (station-i0 + side staircase + plan
−3.37 + drum-warm plan pin the same carriers — one decode round).

Law notes for the bank: (a) a §6-style column cert is auditable in one
pass — re-derive per-column tops on the fresh pair and diff vs ref;
the cert either owns every >3 px excess run or it doesn't. ≤2-col
boundary bleed at a certified band edge and sub-10 px roofline deltas
at the rect floor are not uncovered protagonists — name them, don't
re-litigate. (b) Verdict-authored done-gates (cell floors, runs = ref's
own count, med windows) make re-certification mechanical: every r28
builder number reproduced to the pixel on independent fresh renders;
the byte-identical-crop check against the builder's committed evidence
is a free trust anchor on a deterministic rig. (c) A "declared FINAL
per prior verdict rule" residual (glacis camo split) transfers to
certified-residual status and stops driving scores — write the
acceptance rule into the order text so the successor critic inherits
it unambiguously. (d) When a fitting must stay dark under a family
tone lift, the clone-at-fitting-boundary fix (r28 MG) also pays off in
every OTHER view the dark mass appears in — order the read, not the
mechanism.
