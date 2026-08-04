# isu152 GRADUATE RE-CERT contain1 (track-containment round) — 2026-08-03

Scope: dual-gate graduate (12th, graduated today, r6 critic 9.0 all
fourteen), re-cert of CHANGED regions per the graduate-change protocol:
loftCorridor laneCut (x 0.77, front z>=2.58 floor 1.33, rear z<=-2.74 floor
1.31), skirt-beam bracket rerouted through the measured idler wrap-ring hole
(y 0.78, z 2.9575..3.0025), flapFallDz +0.07, flaps A/B split (outboard
boards full certified depth + A-lane thinned face/plan-lid + B-lane axle
beam through the sprocket ring hole), tail-wall skin +-1.28 -> +-0.76.
Graduation cert stands for unchanged views/members. Renders: fresh
`node tools/tmp-tank-critic.mjs --id=isu152` -> shots/critic-isu152/
(14 views, zero console errors), BYTE-IDENTICAL to the builder's
shots/critic-isu152-contain1/ archive on all 14 — the builder's self-audit
was computed on exactly the state judged here.

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact --ids=isu152`: **front 0 / rear 0**
  (was 306/582, the graduation-day disclosure). The round's whole point,
  confirmed on the official tool at target 0, not just <=60.
- `tools/tank-standard-check.mjs --ids=isu152`: gate min **90.2**,
  components **90.2/90.3/100/94/100/100** — the graduation line EXACT.
  Contiguity **0 holes** (§B2 machine top-down scan), clip 0/0 ✓. Decor
  `mg0+0d ✗` is the carried §I packet justification (hand-authored DShK,
  KIT-migration round queued) — not a new failure.
- `tools/geometry-gate.mjs --ids=isu152` (direct second run): 90.2 PASS,
  identical components — the gate line x2 confirmed independently.
- `tools/tmp-hashgeo.mjs`: isu152 **6df708a8 (47 meshes / 402456 verts)** —
  matches the packet's NEW re-freeze hash exactly. Frozen siblings in
  casemate.js verified: strv103 706159b4 / jagdtiger cf6a7a50 / jpz_e100
  307b2668 / sturmtiger cf630388 / t95 ac99bf6c — all EXACT vs their r6
  verifications. isu122s reads **fdb91d50 (34/368714)** — NOT its old
  b472e956 freeze, but this matches its OWN packet section exactly:
  isu122s is a co-changed graduate in this same containment batch
  (audit 401/215 -> 0/0) with its own declared re-freeze and its OWN
  re-cert critic; out of my scope, recorded for the orchestrator (land the
  batch only with that verdict in hand too).
- §D visual evaluator: the OFFICIAL page aborted — `isu152 has no GLB
  reference registered`. Root cause: tools/visual-evaluator-page.html's
  hand-synced CRITIC_REFERENCE_OVERRIDES (graduate fallback) was never
  updated when isu152 graduated this morning (tmp-tank-critic.html line 37
  has the entry; the evaluator page does not). Ran a byte-faithful tmp sync
  copy instead — tools/tmp-visual-evaluator-isu152.mjs +
  tools/tmp-visual-evaluator-page-isu152.html, identical except the isu152
  entry copied verbatim from tmp-tank-critic.html: **RIG PARITY OK**
  (yawProxy <=0.7 deg on ortho boards, worst 3.2 deg @close-front,
  |dCentroid| 0.105 m — the graduation run's parity profile). Carried §D
  classes reproduce at byte-same coordinates: rear drum-shoulder
  Δ-18.2/+17.9 @x +-1.44, right stepped-arc 155.3 deg/0.59 m
  @z -3.18..-2.64, close-front left-edge Δ-3.4 deg (REALIGN wall
  architecture), top 5.13 m continuous plan edge, hero enclosed-void
  3.142/5.040 m2 (certified caveat class, was 3.145/5.032). Changed-zone
  flags are all bow-hem-class: Δ8.1-10.9 deg on 0.6-0.8 m flap-hem edges at
  z 2.35..2.73 y 0.10..0.34 in the four quarter views — same magnitude
  family as the r6-certified per-view worsts (fl +13.7 / rl +12.7 /
  rr -11.4 / fr -11.0, unchanged this round) and they trace the declared
  flap-fall/lane members. Evidence at shots/visual-eval-isu152/ (fresh run;
  note it supersedes the r6 archive at the same path).

## Change-footprint forensics (r6 graduation archive vs fresh renders)

- Pixel diff (tools/tmp-recert-diffmap-isu152.py): every view's changes
  confined to the PROC pane lane/flap/tail zones, 0.03-0.92% of frame
  (largest view-front 0.92% = the two bow lanes; ref pane byte-stable).
- Silhouette-mask diff (tools/tmp-recert-silmask-isu152.py, bg-class
  discriminator): **dead-front +2 px / dead-rear 0 px** — the registration
  and 12%-band carriers untouched (dims 100 agrees). Flank outlines change
  ONLY at the declared flap-fall +0.07 z hem (~46 px at the bow tip,
  left/right mirrored); quarters +-25 px at the flap tip + tail-skin
  corner; close-roof -15 px wrap-corner nib. view-top GAINS two mirrored
  75 px strips at exactly the rear lane x-windows — the A-lane plan-lids
  landing where the r6 1-cell pad-gap leaks were: a §B2 improvement the
  machine scan confirms (0 enclosed cells).

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.1 | The r6 diagonal loft wedges crossing BOTH bow lanes are gone; each lane now reads a two-layer shoe stack (pads + chain shadow) top-to-bottom with the corridor wall behind — physically honest where plate used to cross. Center bow face, slot band, beam, ribbed bins, proud ball all certified-carried (front battery signatures reproduce). Lane interiors color-classed: 0% bg-class, 100% warm. Enclosed-bg 45 px (r6 47, improved); silhouette +2 px. |
| close-front | 9.1 | Flap-fall plate stands clear of the idler wrap with honest air beneath (5x crop: thin clearance shadow, then unbroken stepped shoe arc against sky). Nose battery EXACT on my rects: ball drop below crest 0.174 m (band 0.15-0.2), dark bore + stepped tip, ribbed bins, frame bars. The deeper bow shadow pocket = the ref's own under-flap class (ref pane shows the same darkness under its ribbed flaps; packet delta note confirmed). Enclosed-bg increase (452->499 column-method) sits entirely inside the r6 raycast-certified warm-AA zone (pane 120-180/390-450); connectivity scan reads ~213 real, biggest cluster zoomed = the under-fender slot between shoe crowns and plate, bounded both sides. Ball-zone iqr 19.8 vs banked 19.9 (tool-AA drift, disclosed). |
| rear | 9.1 | Silhouette 0-diff — dead-rear identical to graduation. Flap A/B split invisible from dead-rear: outboard boards + A-lane face keep the certified flap read (arched dotted mudguards, tip strips byte-level carried); crest rows worst 1.150 @y124 + disclosed 1.175 AA row EXACT; drums [301,321] EXACT; handrail band iqr 0.0 EXACT. New mirrored wedges above the flaps (x1085-1130/788-830, y354-370) color-classed: 0% bg-class, 100% warm, luma p50 ~112 — lit corridor-wing surface at grazing angle, not sky. Enclosed-bg 78 px BYTE-EXACT = the certified standoff-slot set. |
| rearleft | 9.0 | Quarter look fully carried (drum, crates, curl horn, skirt band, wheel rings). Stern wrap at 4x: shoe stubble arc unbroken, flap plate attached, no coincident-face shimmer, under-fender band continuous. Bow-far tip shows the flap-fall +0.07 z as a slightly longer two-layer flap nib — attached to the fender line. Tail-skin narrowing swaps 10 px of stern-corner plate for shoes (declared). Enclosed-bg 124 px BYTE-EXACT to certified. Evaluator's lower-left Δ-8.1 (0.80 m, +-0.5) is the flap-hem class on the declared member. |
| rearright | 9.0 | Mirror-clean: wrap + flaps + drum pile carried; shoes read below y~1.31 at the tail over-track span where plate faces sat (the declared honest swap, covered dead-rear by the -2.74 face). Enclosed-bg 73 px vs certified 71 (+2, epsilon). Δ+10.9 lower-right = same hem class, declared member. |
| left | 9.1 | Flank silhouette IDENTICAL except the declared +0.07 z flap hem (mask diff: 46 px at x1089-1096, nothing else). Corridor wings invisible side-on exactly as claimed — the core carries the certified profile. Bracket reroute invisible: threads the measured wrap-ring hole; no member pokes the wrap face at 5x, arc unbroken. Full r5 left battery EXACT: window band 24.4 vs ref 26.7, y396 0.7% vs 1.9, muzzle sky-break S43-44/G2-3/S5-7 at x323-328, stern teeth x74+ parity with priced flap-occlusion bottoms. Enclosed-bg column-method +25 vs certified = the flap-board air slots (open-air, ref's own under-flap grammar; connectivity scan at-or-below certified). |
| right | 9.1 | Mirror: silhouette change only at the flap hem (42 px); wraps clean; curl horn intact with top line +0.017-0.033 of ref over z -2.90..-3.20 and the curl rect sky 6.4 vs ref 14.6 EXACT; sun-side crescents rim 102.0/112.3 vs face 93.8/97.9 EXACT (certified deviation, disclosed). Wheel-bay slot field ~1060 vs certified 1036-class (same periodic clusters, certified right-flank grammar). |

Supporting (non-focus, checked): view-top plan footprint MORE solid (leak
lids; the 11 px bow-line shift in plan = flapFallDz; intake cells p05
56.7/58.6 inside the certified 56.4-58.6 family; housing composite p50 85.7
iqr 10.1 EXACT; dome/rim/part-band 86.5/90.3, 79.7/90.3, p05 80.9 EXACT);
close-roof wrap corner now reads shoe teeth where a plate nib sat, deck
filled, enclosed 14 px EXACT; hero-frontleft carries the full graduation
flank story (echo 75.3/102.8/104.3 with the builder-disclosed -0.4 wall
row-mix), enclosed 110 px EXACT; hero-toptilt deck FILLED at tilt, +2
sub-visible 8 px crevices at the flap/track junctions (zoomed: bounded
shoe-gap/clearance shadows, not hull holes); hero-rearright improved to
~7 px real. No see-through void anywhere at 1x; every moved member reads
attached (§B2).

## RE-CERT: YES

All changed views >=9.0 (min 9.0 rearleft/rearright; max 9.1 x5). The
306/582 containment debt is DEAD at 0/0 on the exact audit, the lanes read
honest two-layer track where hull plate crossed, the flap/bracket/skin
reroutes are silhouette-invisible except the declared +0.07 z hem, the
graduation-certified look (proud ball, drum shoulders, curl horns, crate
grammar, run-line flank story, dome/louver deck) survives with its r5+r6
battery reproducing EXACT on byte-fresh official pairs, and the 90.2 x2
gate line + 6df708a8 (47/402456) hash match the packet. Re-freeze at the
orchestrator's landing is approved from the critic side. No coordinate
orders.

Orders for the orchestrator (tooling/process, non-blocking for this land):
1. SYNC GAP: add isu152 to tools/visual-evaluator-page.html
   CRITIC_REFERENCE_OVERRIDES (copy tmp-tank-critic.html line 37 — my
   tools/tmp-visual-evaluator-page-isu152.html carries the exact entry);
   the official §D tool cannot run on the newest graduate without it. Add
   the evaluator-page fallback to the §10 graduation checklist so the 13th
   graduate doesn't repeat this.
2. isu122s rides this same casemate batch with its own re-freeze
   (fdb91d50 verified matching its packet) — land only together with its
   own re-cert verdict.
3. The fresh §D run overwrote the r6 evidence at shots/visual-eval-isu152/;
   if the program wants per-round evaluator history, archive to
   shots/visual-eval-<id>-<round>/ going forward.

Residuals (declared, priced, non-blocking): flap-board air slots at the
bow tip read as 1-2 px sky slits at 1x (ref's own under-flap grammar);
close-front under-fender slot darkness (r6 raycast-certified zone class);
ball iqr 19.8 vs banked 19.9 and housing left-edge row-min 81.0 vs quoted
80.7 (tool-AA drift class); hero wall 102.8 vs banked 103.2
(builder-disclosed row-mix noise); the pre-existing curl stepped-arc,
drum-shoulder frame edges, and continuous-plan-edge §D families all stand
under the graduation cert.
