# leo2_revolution r19 TONE-ROUND MINI RE-CERT — independent critic (2026-08-06)

Full 14-view re-certification of the r19 P-R1/P-R2 TONE round (albedo/
vertex-color only, ZERO geometry) at candidate **b53a16f8**, landed 9591763.
Baseline = the RATIFIED r18 verdict (floor 9.0 / mean 9.04,
docs/critique/shaded-parity-leo2_revolution-r18-recert.md) at ce7f3824 +
the batch-43 wing-band excision (ref-side §E repair, landed eaa4622). Per
BUILD-STANDARD §B7(3) the TURRET is scored photo-class against the real
Rheinmetall MBT Revolution; REF PARITY governs hull-only reads; the
§B7-capped gate line (min 62.8) is ADJUDICATED and outside this verdict.
My job: (1) did P-R1 kill the r18 fill/recess order (flat-grey slabs,
lit-top slivers, box-corner reads) with the SHADOW-FILL LIT-TOP term, (2)
did P-R2 kill the SEOSS pale top, (3) did ANY view regress below its r18
ratified score (over-darkening, tone seams at the fill-clone boundary,
DEEP-SHADE ALBEDO CLAMP violations). I am adversarial to the builder's
claims; every number below is my own run.

## Provenance (all commands mine, this session)

- Tree: HEAD 9591763 at session start (r19 landed); foreign lanes landed
  unrelated commits mid-session (HEAD 991f50b at verdict) — leopard.js /
  kit.js / public refs CLEAN throughout, and the hash brackets below pin
  the candidate bytes across the entire evidence window.
- Byte discipline, `node tools/tmp-hashgeo.mjs
  --ids=leo2_revolution,leo2a5,leo2a6,kf51` ×3 BRACKETING all renders
  (before gate, after yaw-pair, at verdict): leo2_revolution **b53a16f8
  (78 meshes / 107353 verts)** all three — exactly the packet candidate,
  meshes/verts unchanged from ce7f3824 (geometry-identity claim). Frozen
  sibs byte-identical ×3: leo2a5 **2f9d0af0**, leo2a6 **f25dad51**, kf51
  **1452024b**.
- Official gate ×2: **min 62.8 | hull 91.8 / whole 69.9 / turret 62.8 /
  stations 78 / dims 99.5 / floaters 100** — tool JSON cmp BIT-IDENTICAL
  between runs, reproducing the ratified r18/batch-43 line TO THE DECIMAL.
  Row decode: side_hull **91.79** / plan_hull **97.56** / front_hull
  **95.35** / plan_whole **97.39** (hull rows byte-equal r17/r18);
  side_whole 80.00 / front_whole 69.94 / side_turret 73.49 / plan_turret
  62.82 = the post-43 §B7 cap table exactly; stations decode st6 3.37 /
  st7 4.46 / st9 5.08 / st10 9.28 / st11 9.59 topPct, st8 wPct 2.91,
  st11/12 wPct 2.6/2.6, st12 topPct 0.11 (tail plate preserved); dims
  h 0.5 / hullL 0.68 / overallL 1.06 / w 0.11; registration UNMOVED
  (side dAlong 0 / dy −0.004). Mask-neutrality of the tone round PROVEN.
- Renders: fresh 14 shaded pairs `node tools/tmp-tank-critic.mjs
  --id=leo2_revolution` → shots/critic-leo2_revolution/ (zero console
  errors, favicon 404 only), bracketed by the hash runs. The r18 critic's
  ratified pairs preserved to scratchpad BEFORE overwrite = my delta
  baseline.
- Official audits (each self-ticketed, run sequentially): track-clip
  --exact **front 0 / rear 0 | shoe 0 / 0, blind spots 0**; turret-parent
  **stranded 2 / abutting 0 / dangling 0** at 53%/26% — byte-same as the
  r18 close (the two certified mast-union AABB false-flag classes);
  standard-check **clip 0/0 ✓ | contig 0 ✓ | decor mg1+4d ✓** (gateMin
  62.8 = the adjudicated §B7 row only); visual-evaluator exit 0, **RIG
  PARITY OK — max dYawProxy 2.4° @close-front**, flagged edges = the
  capped §B7 wedge-vs-print classes.
- §J yaw-90 pair RE-RENDERED AT THE VERDICT HASH:
  `node tools/tmp-defuse-recert-yawpair.mjs --id=leo2_revolution` →
  shots/defuse-recert-yaw/. The ENTIRE turret mass — wedge, panels,
  SEOSS (dark head), RWS, rack, ring fills WITH their new bake — rotates
  as one; census: hullTopsByZ ≤1.712 inside the turret footprint, only
  the hull-TRUE mast 2.465 @ z −3.7/−3.8 above it. §B5 unity holds at
  b53a16f8.
- Measurements (tools/tmp-leo-r19recert-{diff,zones,measure,maskstats,
  crop,flood}.py): per-half pixel diffs vs the preserved r18 pairs,
  ITU-601 luma rect + changed-mask percentile batteries, 3×–6× crop
  stacks of every tell zone, enclosed-sky flood (r18 method: bg maxch≤13
  AND B−R≥+8, border flood removed, label band y13–21 excluded).

## HEADLINE: RE-CERT PASS (re-freeze b53a16f8) — floor 9.0, mean 9.11; both orders delivered, zero regressions

P-R1 and P-R2 are DEAD as ordered. The fill/recess assembly no longer
reads as boxes with lit lids: top faces sit at shadow-consistent tone
(view-band medians −5 luma), the r18 frontleft/close-front lit-top
slivers are gone at 5×, the box-corner reads at 2×–4× (close-front slabs,
hero-rearright under-rack) are gone, the walls carry a legible
bottom→top ambient grade, and the recess steel now separates at the
recess mouth. The SEOSS head reads as a self-colored sight-family
housing in ALL views that see it (top/front/rear/close-roof/toptilt/
heroes) — the pale camo-mottled top is extinct; at 6× it now parses as
an OPTIC, which is what the photo class shows. The deep shadow floors
were correctly LEFT ALONE per the DEEP-SHADE ALBEDO CLAMP (near-black
populations static: rear 6364 px identical count AND bbox, front pockets
840 identical, close-front 2274→2285), so nothing crushed to ink and no
view lost structure. Enclosed-sky flood: delta **0 on all 14 views** vs
the r18 banked counts — silhouettes untouched, and the darkened fills do
NOT read as sky (blue-signature term rejects the steel tones).

front 9.2 · frontleft 9.1 · left 9.0 · rearleft 9.0 · rear 9.1 ·
rearright 9.0 · right 9.0 · frontright 9.1 · top 9.3 · hero-fl 9.2 ·
hero-rr 9.1 · hero-toptilt 9.2 · close-front 9.1 · close-roof 9.2 —
**no view below its r18 ratified score; floor 9.0 held by the four
side/quarter views whose change is sub-visible at 1×.**

## Standing-check table (§F.4)

| # | Check | Required | Measured (mine) | Verdict |
|---|-------|----------|-----------------|---------|
| 1 | gate ×2 EXACT | 62.8 \| 91.8/69.9/62.8/78/99.5/100 bit-identical | exactly that, JSON cmp-clean ×2; hull rows 91.79/97.56/95.35 + plan_whole 97.39 byte-equal r18; reg dAlong 0 / dy −0.004 | PASS |
| 2 | tmp-hashgeo ×2 bracketing | b53a16f8 stable; sibs 2f9d0af0/f25dad51/1452024b | b53a16f8 (78/107353) ×3 (opened, closed, verdict-time); sibs byte-exact ×3 | PASS |
| 3 | §J yaw-pair at b53a16f8 | entire turret yaws as one incl. fills | 4-cam pairs: wedge/panels/SEOSS/RWS/rack/fills all rotate; deck keeps only chassis + hull-true mast (2.465 @ z −3.7/−3.8); census tops ≤1.712 in footprint | PASS |
| 4 | standard-check | contig 0 | clip 0/0 ✓, contig 0 ✓, decor mg1+4d ✓ | PASS |
| 5 | track-clip --exact | 0/0 band + shoe | front 0 / rear 0 \| shoe 0/0, blind 0 | PASS |
| 6 | turret-parent | certified classes only | stranded 2 / abutting 0 / dangling 0 @ 53%/26% (byte-same as r18 close) | PASS |
| 7 | evaluator rig parity | no RIG MISMATCH | RIG PARITY OK, max 2.4° @close-front, exit 0 | PASS |

## Claims audit (§D — packet r19 done-gates re-derived on my rig)

- Gate ×2 bit-identical at the ratified line + hash move ce7f3824 →
  b53a16f8 with meshes 78 / verts 107353 UNCHANGED: **CONFIRMED ×3**.
- Frozen sibs byte-identical at close: **CONFIRMED ×3**.
- Tone deltas (re-derived EXACTLY on the builder's own
  shots/leo-tone-r19 renders, then independently confirmed in MY pair
  frame): view-top med 55.6→49.4 ✓; view-rear med 46.1→41.5 ✓ (my
  pair-frame mouth strip reproduces 46.1→41.5 to the decimal);
  view-front med 53.7→50.5 with p10 40.1→34.6 ✓; close-front med
  40.1→35.2 with p90 53.8→64.1 ✓ (the recess-mouth steel lift). Changed
  footprint TOTAL 26 583 px t>4 ✓; max 5 963 [view-rear] ✓. My own
  pair-frame proc-half total: 17 982 px = 0.97 of the (640/768)²
  scaling expectation — consistent.
- Packet ERRATUM (trivial): the claimed minimum "369 px [view-rearleft]"
  is mis-attributed — 369 px is **view-left**; view-rearleft is 372 px.
  Three-pixel bookkeeping, zero material impact.
- track-clip/standard-check/turret-parent/npm-battery lines: **CONFIRMED
  to the digit** (my runs above).
- "Positions/index untouched, meshes stay /shadow/i-named
  (mask-excluded)": consistent with gate bit-identity + flood delta 0 +
  blob bboxes unmoved; the §J yaw pair shows the fills still riding the
  turret.

## Order delivery verdicts (measured)

**P-R1 — fill/recess tone pass with the top-face darkening term: DELIVERED.**
- LIT-TOP KILL (the SHADOW-FILL LIT-TOP law term): the r18 tells are
  dead — frontleft fore-fill top slivers gone at 5× (crop stack), the
  close-front slab lids gone at 4× (the "box with a lit lid" read no
  longer exists; an arris line survives as structure, correctly), the
  hero-rearright under-rack box corners gone at 4×. Changed-mask
  medians on the band zones: close-front 40.1→35.2, rear mouth strip
  46.1→41.5, frontleft 42.1→37.2, right 40.1→35.2, frontright
  40.1→34.6, hero-fl 38.8→33.3, hero-rr 37.8→32.3, close-roof glimpse
  35.8→30.3 — the top-face population dropped ~5 luma EVERYWHERE while
  sd held (1.6–4.1 before vs 1.3–3.9 after: graded, not crushed).
- RECESS-STEEL SEPARATION (the r18 self-read residual): verified — the
  builder's close-front p90 53.8→64.1 re-derives exactly; my
  front-pockets and close-front crops show the steel edge reading at
  the recess mouth against the graded shadow.
- INK-FLOOR DISCIPLINE (DEEP-SHADE ALBEDO CLAMP): the zero-variance
  floor populations were left alone — near-black census: view-rear
  6364 px <12 IDENTICAL count and bbox before/after, view-front 840
  identical, close-front 2274→2285 (+11, same bbox). The mixed-zone
  ink sub-population lifted p10/p25 5.5→6.1–6.2 (the reachable part).
  No over-darkening anywhere: no band's percentile spread collapsed.
- SEAMS: hunted along every fill-clone boundary (fills moved to the
  dedicated fillDark clone; cables kept certified tone) at 3×–6× on
  ten zones — NO tone seam, no discontinuity where fills meet cables,
  recess steel, or hull.

**P-R2 — SEOSS pale top → sight-family tone: DELIVERED.**
- The changed-mask triplet reads as the self-colored-unit signature in
  every SEOSS-bearing view: p90 DOWN (pale population extinct: front
  70.7→63.1, rear 70.1→60.3, frontleft 71.6→65.1, rearright 72.9→64.3,
  left 68.5→61.4, hero-fl 72.3→66.3), sd DOWN (e.g. rear 7.3→3.2,
  front 8.0→6.2), med converging on the housing tone; top-down views
  drop outright (view-top 55.6→49.4, hero-toptilt 54.6→47.4). At 6×
  the head is a uniform self-colored housing with its ring/pedestal/
  visor/lens tells intact — the a5/a6 PERI-head optics class, which is
  ALSO the real vehicle's read. Silhouette, the 2.66 heightM anchor and
  the −1.01 front column are untouched (dims row byte-equal, flood 0).

## Per-view scores vs the r18 ratified table

Severity per the §B7 CARRIED-CLASS ANCHOR: carried classes keep their
ratified severity; deltas are priced by same-rect measurement. Bar ≥9.0,
graduation severity, turret photo-class / hull ref-parity.

| view | r18 | r19 | Δ | justification (my measurements) |
|---|---|---|---|---|
| front | 9.1 | **9.2** | +0.1 | BOTH r18-named residuals for this view resolved: SEOSS pale top dead (2047 px, 1×-visible; p90 70.7→63.1), pocket lids graded (1346 px, med −5.5); 840 px honest pocket ink held; wedge/prow/hull grammar unchanged (byte-identical geometry) |
| frontleft | 9.0 | **9.1** | +0.1 | the r18 2× lit-top sliver tell (this view's named fold-in) KILLED at 5×; SEOSS dark; band graded (721 px); enclosed-sky 58 exact |
| left | 9.0 | **9.0** | 0 | 306 px sub-visible at 1× (0.07% of proc half); band box-tops die at 4×, ink p10 5.5→6.2; the 1× read is the carried certified §C mechanism — held, marginally better |
| rearleft | 9.0 | **9.0** | 0 | 264 px; SEOSS corner + band trims; 557 thin sight-lines class unchanged (flood exact) |
| rear | 9.0 | **9.1** | +0.1 | the r18 closest-call view: the aft band's lit-lid mouth strip is now a graded shadow (2949 px, 46.1→41.5 exact), rack furniture separates BETTER against it; the deep band core = the honest under-bustle gap, IDENTICAL census (6364 px, same bbox) per clamp; SEOSS rear dark (975 px, p90 70.1→60.3) |
| rearright | 9.0 | **9.0** | 0 | 849 px, mostly the right band top-kill (621 px) + far SEOSS; 1× read effectively unchanged |
| right | 9.0 | **9.0** | 0 | mirror of left (867 px); band graded, no seam, no crush |
| frontright | 9.0 | **9.1** | +0.1 | mirror of frontleft: sliver-class top-kill (426 px band) + SEOSS visible dark (382 px, p90 65.0→63.2 / med homogenized) |
| top | 9.2 | **9.3** | +0.1 | the deck's ONE pale outlier (SEOSS planform, 1×-legible) resolved to the housing tone (55.6→49.4); plan sweep V / deck program / hull plan parity all byte-carried; flood 443 exact |
| hero-frontleft | 9.1 | **9.2** | +0.1 | identity view: SEOSS self-colored at hero range (564 px), under-overhang band graded (467 px, 38.8→33.3); composition unchanged |
| hero-rearright | 9.0 | **9.1** | +0.1 | the r18-named "box corners at 4× under the rack" class KILLED (137 px top-kill + graded void); rack/RWS/module reads carried |
| hero-toptilt | 9.1 | **9.2** | +0.1 | SEOSS top plainly visible at this pose: pale top dead (948 px, 54.6→47.4); prow line/camo coherence carried |
| close-front | 9.0 | **9.1** | +0.1 | the r18 FLOOR view materially improved: slab lids graded (901 px, 40.1→35.2 exact), recess-mouth steel separation delivered (p90 53.8→64.1 on the builder frame, steel edge legible in my 4× crop), lit-top tell extinct; deep pocket honest (2274→2285 px, same bbox); wedge plane shading continuous at max magnification |
| close-roof | 9.1 | **9.2** | +0.1 | SEOSS at 3× now a self-colored housing among the roof program (1821 px; med 49.0→50.2 with p90 55.2→60.1 = homogenization, NOT a pale regression — top face darker, side faces uniform); ring glimpse graded (635 px, 35.8→30.3); hood/periscope/module reads carried |

Mean **9.11** (127.6/14), floor **9.0**, ceiling 9.3. No view regressed;
ten of fourteen moved up on measured deltas.

## Residuals certified this round (none blocking, no new orders)

1. The ring band at 1× remains a CONSERVATIVE DARK READ — the deep
   floor population is shadow-lit (p10=p25 zero-variance segments), the
   DEEP-SHADE ALBEDO CLAMP provably bounds albedo there, and the packet
   documents the escalation path (ambient-floor hook + re-cert of the
   fills' certified raw-clone tone class) if the owner ever wants a
   brighter band. It parses as the real vehicle's under-overhang gap.
   P-R1 as ordered is CLOSED; this residue is the carried §C mechanism
   at its ratified severity.
2. procShadow_gun proxy +1.6 m past muzzle — carried fleet-class,
   mask-excluded, render-invisible in all 14 views; family LOD true-up
   queued (packet).
3. Whip tips top the turret AABB at 2.700 (SEOSS anchor 2.66) —
   thin-feature, dims-invisible; icon-framing/probe consumers note,
   carried.
4. Front embrasure pocket asymmetry (left 840 px ink vs lighter right)
   — carried, parses as lighting at 1×.
5. Top-view outer-column fender read — carried hull parity class, rows
   byte-equal since r17, no order.
6. The §B7 cap rows (62.8 line) stand adjudicated until the owner
   re-opens the region; genuine real-vs-print divergence only, post-43.
7. Packet erratum (trivial): min-diff view label — 369 px is view-left,
   view-rearleft is 372 px.

## Law discoveries (for the bank)

- **RE-CERT DIFF ACROSS AN ORACLE-REPAIR LANDING DECOMPOSES PER HALF**:
  my before pairs (r18 critic's, pre-batch-43) carry REF-half deltas
  from the §E excision that landed between the two critic sessions —
  a pair-frame diff must be split at the frame midline BEFORE
  attribution (REF-half = the repair's footprint, PROC-half = the
  round's), or the round gets billed for reference bytes it never
  touched. The proc-half footprint then reconciles with the builder's
  single-model diffs by the resolution-square ratio (0.97 of (640/768)²
  here).
- **SELF-COLORED-UNIT HOMOGENIZATION SIGNATURE**: a camo→self-colored
  bucket move reads on the changed mask as p90 DOWN + sd DOWN with med
  free to move EITHER way (close-front med rose 54.1→64.1 while p90
  fell 72.3→65.1). Critics must read the triplet — pricing the med
  alone mis-reads a pale-top kill as "brightening" (or a legit
  homogenization as a regression).
- **CLAMP-BOUNDED ORDER PRICING**: when a MUST tone order overlaps a
  DEEP-SHADE zone, the deliverable is the MIXED-percentile
  sub-population only (here: lit tops −5 luma, ink p10/p25 5.5→6.2,
  steel p90 +10 at the mouth) — the zero-variance floor stays, and
  holding it against the round is a calibration error. Verify by
  percentile movement + static near-black census (count AND bbox), not
  by wishing the band brighter.
- **FLOOD AS TONE-ROUND NO-REGRESSION ORACLE**: the enclosed-sky flood
  (bg-tolerance + blue-signature) returning delta 0 ×14 against banked
  baselines is a cheap whole-frame proof that a tone round moved no
  silhouette pixel and that darkened steel fills stay distinguishable
  from sky — worth running on every albedo-only re-cert.

## Verdict

**RE-CERT PASS (re-freeze b53a16f8)** — floor **9.0**, mean **9.11**
(was 9.04), highs 9.3 (top) / 9.2 (front, hero-fl, toptilt, close-roof).
All seven standing checks land exactly on the packet's close battery;
the gate ×2 bit-identity at the ratified 62.8 line plus the ×3 hash
bracket proves the round was tone-only on frozen geometry; the §J yaw
pair at the verdict hash proves the retoned fills and SEOSS still ride
the turret as one mass. P-R1 and P-R2 are closed with measurements in
every affected view and zero regressions found — ten views priced UP by
delta, four held. The orchestrator may re-freeze b53a16f8 in the landing
commit; the only escalation path left in this region (ambient-floor
hook for the band floor) is documented, optional, and owner-triggered.
