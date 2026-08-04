# isu152 shaded-parity verdict — post-r6 (independent critic, GRADUATION adjudication)

Date: 2026-08-03. Judged build: **d6e1537** (isu152 r6 landing commit — HEAD
at render time). Provenance: the isu152 render path is judged CLEAN —
casemate.js, userdrops6.js, materials.js, modelLoader.js, profiles/kit.js,
decorations.js, specs.js and the isu152 reference GLB are unmodified at HEAD.
Two dirty tree files touch the shared path and were adjudicated:
`src/vehicles/tankFactory.js` (merkava r12 opt-in params `padHex/chainHex/
gearFloor`, defaults byte-identical — isu152's cfg passes none of them) and
`src/engine/sky.js` + `src/engine/deviceDiag.js` (mobile r4
`enforceEnvValidity` probe — pure validation, no scene mutation on a healthy
desktop bake). Both adjudications are PROVEN empirically: all 14 fresh panes
are **byte-identical** to the builder's archived finals.

Pairs: re-rendered fresh via `node tools/tmp-tank-critic.mjs --id=isu152`
(vite :7463, 14/14 saved, zero console errors) → `shots/critic-isu152/*.png`;
**cmp verified byte-identical on ALL 14** vs `shots/isu152-r6/` —
deterministic rig, same build. Scored ONLY the fresh files.

§D evaluator: `node tools/visual-evaluator.mjs --id=isu152` run this session
(exit 0, 6.4 s, shots/visual-eval-isu152/). **RIG PARITY OK** — yawProxy
0-0.7° on ortho board views, worst 3.2° @close-front, |dCentroid| ≤ 0.103 m;
no RIG MISMATCH, scoring proceeded. Every edge/profile finding sits in the
pre-r6 certified families (the tool's own "at vertical edge — cliff offset"
annotation on all Δtop/Δbot rows; drum-shoulder 0.30 m edge class at
view-rear x ±1.44; casemate wall-architecture class at close-front). Angle
claims below cite its numbers.

Measurement: builder's `tools/tmp-isu152-r6-measure.py` re-run (all r6
done-gate numbers reproduce EXACTLY on my fresh renders), r5 critic's
`tools/tmp-isu152r5c-stats.py` re-run (independent rects), my own flood-fill
+ color-class scan, and the builder's raycast rig
`tools/tmp-isu152-r6-raycast.mjs` (critic-camera-exact) for contiguity.
Standard check re-run this session: gate 90.2 (90.2/90.3/100/94/100/100),
contig 0 ✓, clip 306/582 (IDENTICAL to the r5/r6 disclosures — no new clip),
decor mg0+0d (packet-justified hand-authored DShK, carried). Graduate
integrity at judging state: `tmp-hashgeo` isu122s **b472e956 EXACT
(34/368162)** + strv103 706159b4 / jagdtiger cf6a7a50 / jpz_e100 307b2668 /
sturmtiger cf630388 / t95 ac99bf6c — all EXACT.

## HEADLINE: **GRADUATION PASS — all 14 views ≥ 9.0** (floor 9.0, mean 9.0).
## The four r5 holders (view-frontleft, view-frontright, view-top,
## hero-frontleft) are cured by the three delivered stories; the ten r5
## nines hold with the regression battery reproducing EXACT. isu152 is
## ready for §10 execution by the orchestrator.

Third consecutive round in which every builder number re-measured reproduces
on the official rig — and this round the builder's archive is byte-identical
to my fresh renders, so the claims audit is arithmetic, not trust. All three
r5 stories landed at zero gate cost (90.2 PASS ×2 identical, whole +0.1).

## Per-view scores

| view | r5 | r6 | justification |
|---|---|---|---|
| view-front | 9.0 | **9.0** | Untouched signature holds: bright cast-ball root mass, frame + MG-port ring + beam + ribbed bins; bow slot band. Enclosed-bg 47 px (r5 59, improved). r5 residual set carries unchanged (bow-comb row, mid-beam prominence, recessed-frame vs proud-ball — certified divergence). |
| view-frontleft | 8.5 | **9.0** | The systemic story is delivered and measured: fender shadow run col-min p25/p50/p75 60.0/60.3/60.3 across x100-460 (ordered 55-65L; r5 81.9/93.8 = no run); strip-anchored wall/skirt split +5.2L (ref pane -0.3; ordered ~5L); rim crescents read on all six wheels. Bow pocket checkers CURED: sub-29L 116 → **0** (ref 0), pocket p05 66.1→56.8, and the 2x/3x crops read structured shadow with the chain row visible — no cutout blocks. Flank reads three strata now (run line / seamed wall band / skirt+gear). Residuals: proc layering is crisper panel-grid vs ref's soft cast; ref carries fender stowage boxes we don't; pocket panels read slightly cooler than the warm family at 3x (invisible at 1x). Same tier at 1x. |
| view-left | 9.0 | **9.0** | Silhouette EXACT (549×156 both panes, d=(+0,+0)). Full battery EXACT on my rects: window band dark+sky 24.4% vs ref 26.7% (r4 rect; panel p05 6.1), y392-398 all 0.7-1.8% dark (y396 0.7 vs ref 1.9), muzzle sky-break x323-328 = S43-44/G2-3/S5-7 (r4-certified DShK pattern byte-consistent), stern teeth x74+ ref-exact with the priced flap-occlusion bottoms at x53-71. New dead-side run line (p05 52.2, rows 52-65L) is the order's own "full hull side" clause — reads as plausible fender-lip shadow at 1x (2x crop verified); ref's flat right/left bake lacks it (disclosed deviation). Skirt split reads at p05-p25 dead-side (rail segs ride the 94.2 shade floor — the r6 SHADE-FLOOR TRANSFER law, disclosed). |
| view-rearleft | 9.0 | **9.0** | Single shoulder drum at the ref's own position, dressed crates, curl horn, and the flank now carries the run line + skirt seams at this angle too. Enclosed-bg increase (20→124) raycast-adjudicated as warm-surface false positives (below). Under-stern void band reads as shadow at 1×. |
| view-rear | 9.0 | **9.0** | Battery EXACT: crest rows 124-136 worst ratio 1.150-1.153 (bound 1.2), row 122 = 1.175 disclosed AA row; ONE drum circle per shoulder ([301,321] crossings); crate relief + handrail + C-hook (dark 9.3%, p05 57.6). Enclosed-bg **78 px EXACT** = the r5-certified standoff-slot set. Evaluator's ±18° findings are the 0.30 m drum-shoulder frame edges @x ±1.44 y 1.52-1.80 (Δ-18.2°/+17.9° ±0.3°) — the r5-noted drum/crate composition class, 0.3 m edges, not a floor. |
| view-rearright | 9.0 | **9.0** | Mirror of rearleft; drum pile with cap rings still the best single element. Enclosed-bg IMPROVED 188→71. Idler-gap openness carried (gear-shadow read at 1×). |
| view-right | 9.0 | **9.0** | Curl horn intact — top line +0.017-0.05 of ref over z -2.90..-3.28 EXACT r5 table; the stepped-arc residual is now also §D-quantified (proc straight 155.3° 0.59 m segment UNMATCHED @z -3.18..-2.64 y 1.25-1.49 where the ref reads one smooth arc — priced r5 residual, carried). Sun-side crescents rim p50 102.0/p90 112.3 vs face 93.8/97.9; ref's own right flank is FLAT (85.5/86.0 rim = face; wall 85.8 = skirt 85.7) — the ordered "brighten, never resize" deviation, disclosed; 3x crop reads dimensional steel wheels, not paint noise. Skirt split -5.5 dead-right. Enclosed-bg improved 1182→1036 (bow-bay corridors closed). Wrap-occlusion sky 6.4% vs 14.6% carried. |
| view-frontright | 8.5 | **9.0** | Mirror deliveries measured: run col-min 59.9/61.8/62.8; pocket p05 55.8, sub-29L 0 (was the 118-px bow-bay panel — root-caused and re-painted); sub-45L 30 vs ref 13 (hooked micro-shadows at threshold + AA, disclosed). Pocket p75 101.1 vs ref 108.0 = the r3 wheel-radius bound (ref's r~0.25 wheels fill its bay). Flank reads layered; face/cheek MG-port ring strong. |
| view-top | 8.5 | **9.0** | Both r5 plan signatures delivered. (1) Gun-root housing: 48 px composite spanning px 310-358 matching the ref block x -0.64..+0.16 to ±0.01 m — fairing plates + edge lines + central ball; interior p50 85.7 vs ref 89.1 (p25-p75 82.8-92.9 vs 86.1-91.6, family), left-edge row-min p50 80.7. Residuals disclosed: iqr 10.1 vs 5.5 (sun/shadow asymmetry across the pair + certified bright ball crown p95 122.4) and the pre-existing sun-lit spare-track blob at px 300-315 (unordered, unchanged). (2) Dome-slice CURED: slats END at the dome rim (4x crop verified — circle intact, no crescent slicing); inside-dome p25/p50 86.5/90.3 vs ref 83.8/86.2 (certified deck +4-8 family), 16-spoke rim dips p25 79.7/p50 90.3 vs 81.1/86.0; left part-band keeps the slat minima (p05 80.9; the rect's 46/58 rows pre-exist in the r5 archive — verified byte-level, the r4 dome-ring torus in the board-joint gap). Carried residuals: intake-cell block composition, louver FIELD +8, proc's continuous 5.13 m left plan edge vs the ref's segmented one (§D UNMATCHED family) — same class of residual other 9.0 views carry. |
| hero-frontleft | 8.5 | **9.0** | The first-glance "slab-sided box" read is gone: at 1.55× hero distance the flank presents run line (col-min p50 75.3 vs r5's flat ~94), seamed wall, skirt band, rimmed wheels, structured bow pocket. The strip-anchored wall/skirt scan reads 101.2/104.3 — same polarity and magnitude as the REF's OWN hero read (99.1/101.5): the elevated perspective mixes deck content into the skirt rows on both panes (builder-disclosed; the ref itself is not split-readable at this angle). Casemate, ball+horn, DShK cluster, dressed deck, bow all carry from r5. Residual: crisp panel language vs cast softness — family tier. |
| hero-rearright | 9.0 | **9.0** | Crates, single drum row, curl arcs, DShK hold; flank gains the run/seam story at this angle. Evaluator enclosed-void 3.145 m² = the barrel/deck silhouette-loop class (tool's own caveat); pane scan 121 px, warm-surface class, §B2 machine scan 0 cells. |
| hero-toptilt | 9.0 | **9.0** | Battery EXACT: mound ring zones p05 72.7/73.9 vs crowns p95 108.4/114.4, sub-50 arcs present both mounds; cells recessed; louver band present; dome intact at tilt (no slicing echo); housing plates echo at the glacis root. Evaluator enclosed-void 5.032 m² = barrel-gap class as above (pane scan: 3 px). |
| close-front | 9.0 | **9.0** | Nose battery EXACT: ball drop below crest 0.174 m (band 0.15-0.2), dark bore + stepped tip, ribbed bins, frame bars; ball zone iqr 19.9 vs ref 12.1 on the builder rect (r5-class residual, slightly improved). Enclosed-bg 245→452 adjudicated: the increase is the left bow-pocket/idler zone (clusters at pane (120-180, 390-440)), warm-surface false-positive class (below), no black cutouts visible at 1×. §D close-front left-edge Δ-3.4° (64.9° vs 68.3°, 2.84 m edge, ±0.1°) sits against this view's own 3.2° yaw-proxy — the REALIGN-certified wall architecture (vertical plate + chamfer knees; the ref's apparent lean was fitting columns), certified family, not a defect order. |
| close-roof | 9.0 | **9.0** | R-cupola pale-lid physics + stud rows EXACT at the r5 rects (stud zone p95 105.8 iqr 5.7); byte-level identical numbers on the r5 archive at the same coordinates — no regression. DShK reads: pintle column, receiver mass, AA ring, barrel line in plan; dark aperture stays a flank slit. Deck/dome paint reads dimensional. |

## Contiguity adjudication (the one new forensic item this round)

The pane-level enclosed-bg scan rose on left-flank views (frontleft 42→142,
left 64→201, rearleft 20→124, hero-frontleft 23→110, close-front 245→452)
while falling on the right/pocket views (frontright 249→31, right 1182→1036,
rearright 188→71) and holding EXACT where certified (rear 78, top 14,
close-roof 14). Every increased cluster maps to ONE zone: the left bow
pocket / idler interior — exactly where r6 re-built the bay. Adjudication by
the builder's critic-camera raycast rig on the EXACT enclosed coordinates
(10 probes): **every ray hits solid geometry** — first hits at d≈58 on the
r6 bay surfaces themselves (#5e5341 bow panels, #928054 lining tone class,
#262218 shadow mat, #6e613c/#6e623c shoe mats) — zero sky escapes. Color
classing over ALL enclosed px: the increases are 100% warm-ordered
(R≥B, luma ~24-33) surface px that fall inside the |px−0x151b20| maxch ≤13
window; exact-bg px (≤3) hold constant per pane (~86-92 = the pane label's
letter interiors, +32 at view-rear = the certified standoff slots).
**Finding for the bank: the r6 pocket's darkest warm AA corners land INSIDE
the bg discriminator window — future hole scans on this build must
color-class or raycast before crying void.** §B2 CONTIGUITY: PASS (machine
top-down 0 cells; no see-through at any of the 14 angles).

## Owner laws

- NO EMPTY AREAS / CONTIGUITY: **PASS** — above; evaluator's two hero
  "enclosed-void" flags are its documented barrel/deck silhouette-loop
  caveat class, not holes.
- DECORATION MINIMUM / MG PHYSICS: **MET (carried r4/r5 certification)** —
  DShK byte-consistent (muzzle sky-break pattern EXACT at x323-328; reads at
  close-roof/plan/view-left). Census mg0+0d stands on the packet
  justification (KIT.fittings migration = queued dedicated round).
- TRACK CONTAINMENT: **PASS visually** — 4× zooms both wraps both flanks:
  flap and curl-horn plates ride clear with sky slots; no hull solid crosses
  a band. Audit 306/582 IDENTICAL to the r5-disclosed pre-bar state (no new
  clip this round); stays flagged for the queued orchestrator containment
  round per the pre-dating rule.
- VARIANT DISTINCTIVENESS (§H4, family has 2 built members): isu152 vs
  isu122s graduate — tells at a glance: short fat ML-20S with recoil-sleeve
  stack + offset-right ball vs the 122s' long slim tube; drum pair + crate
  pile stern vs the 122s' fender rows; DShK arrangements differ. PASS.
- Certified bounds all bind and none were violated: window-band ceiling
  (25.9/24.4 vs 28.4/26.7 reproduces EXACT — the closed r5 order stayed
  closed), flap-occlusion bottoms, sprocket ±1.43 pair (gate lane),
  ambient 51.3L clamp + 94.2 shade floor (per-flank q respected it — the r6
  transfer law), union-ymax/p95 (gate identical 90.2 ×2, nothing above
  2.494 added), the ref's own flat right flank (all deviations disclosed
  with their order clauses).

## Claims audit summary

Every r6 done-gate number reproduces exactly (builder tool re-run on
byte-identical fresh renders + r5 critic's independent-rect tool + my own
scans): run bands, splits (+5.2 quarter / 89.5 & -5.5 dead), crescents
(+10.0/+14.4 p90), pocket 116→0 sub-29L with p05 56.8/55.8, housing span/
edges/interior, dome/rim/part-band, hero echo 75.3. The r5 regression
battery is EXACT everywhere it was claimed EXACT (crest 1.153, drums,
cells 57.6-58.6, ball 0.174, y396 0.7%, stern teeth, curl line, window
band, sky-break, mound rings, studs, R-lid). The only two r5-tool blocks
that moved (louver row minima, its whole-band p50 95.8→94.5) moved exactly
where order 3b operated, in the ref's direction, with the 46/58 rows proven
pre-existing in the r5 archive.

## Verdict

**GRADUATION PASS — all fourteen views at 9.0** (floor 9.0; r5 floor 8.5
cured on all four holders; ten nines held with zero regression). Claim
discipline: three clean rounds running. No fix orders. Orchestrator
executes §10 per GEOMETRY-GATE.md: registration retirement, SOURCED_IDS,
icons, packet freeze + hash, both override maps — isu152 becomes the
program's 12th graduate. Queued rounds unaffected by this verdict: casemate
track-clip audit round (306/582 pre-dating flag), KIT.fittings DShK
migration round.
