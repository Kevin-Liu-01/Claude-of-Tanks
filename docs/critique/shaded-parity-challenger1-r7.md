# challenger1 shaded-parity r7 — independent critic, FIRST formal adjudication (2026-08-05)

Bytes and rig integrity, verified by me this round:
- `tmp-hashgeo` challenger1 = **8ef58c18** (41 meshes / 88 644 verts) at
  campaign START and END — no drift. Family watch at both ends:
  chieftain5 graduate **5117b9a8**, centurion3 **caa2e91c**, centurion5
  **bbcf7d80** — all EXACT.
- `node tools/geometry-gate.mjs --ids=challenger1` **×2 at start:
  min 90.1 PASS both, identical lines** (hull 91.9 / whole 90.1 / turret
  90.2 / stations 90.6 / dims 95 / floaters 100), ×1 at end — identical
  again. This is the push-2 gate-pass reproduced exactly (7ce5be3).
  Priced headroom for orders: **whole 0.1 (!), turret 0.2, stations 0.6,
  hull 1.9**. Every mask-visible order below is priced against that 0.1.
- `tank-standard-check`: PASS (clip 0/0 exact ✓, contig 0 ✓, mg1+0d ✓).
- `turret-parent-audit`: stranded 0 / abutting 0 / dangling 0.
- Official rigs, fresh this round (FIFO ticket honored):
  `tmp-tank-critic --id=challenger1` → shots/critic-challenger1/ (14
  pairs, 12:15, zero console errors);
  `visual-evaluator --id=challenger1` → shots/visual-eval-challenger1/
  (camoSeed 4242). **RIG PARITY OK — no RIG MISMATCH: max yawProxy 2.1°
  @rear, all others ≤1.6°, max |dCentroid| 0.068 m.** Scoring valid.
- Tone/sky numbers: tools/tmp-cr1-r7-{luma,rects,skytest,voidcrop,
  wheelprobe}.py (ITU-601 luma rects; sky = mask-method + blue-signature
  per §D). Zoom crops (shots/critic-challenger1/crops-r7/) are
  diagnosis-only; every claim below cites official-render rects or
  evaluator numbers.

## HEADLINE: **FAIL — floor 5.5, mean 6.3 (standard first-round). Floors: view-left 5.5, view-right 5.5.**

front 7.0 · frontleft 6.5 · left 5.5 · rearleft 6.0 · rear 6.5 ·
rearright 6.0 · right 5.5 · frontright 6.5 · top 6.5 · hero-fl 6.5 ·
hero-rr 6.5 · hero-toptilt 6.5 · close-front 6.0 · close-roof 6.5

The geometry program delivered — and delivered §B1 better than any UK
sibling I have boards for: the glacis is ONE plate, the bow guard course
is one co-planar rake (the owner's staircase screenshot class is DEAD at
1×), the crown asymmetry genuinely motivates the right roof, and the
\\________/ trapezoid articulates at both ends with a raised idler and
sprocket. The shaded read is not "same vehicle, same tier" yet, for the
same family reason as the centurions: **the running gear does not read.**
Both refs present six pale dished road-wheel discs below the skirt hem;
the proc seals that window behind the outer board row and renders the
remaining slit near-black (rows y382..387 luma 7–17 vs the ref band
26..70). Zero of six discs read per side. On top of that: the ref's big
pale mud flaps are absent at all four corners (exposed black wrap faces,
Δluma ≈ −33), a sand/warm-grey off-palette fittings family (TOGS, sight
cap, dust-cover boxes, travel-lock, bustle plank), ~8 blue-glowing glass
chips in the front view alone, and a census-passing MAG that never reads
as a weapon in any of the 14 views.

## Per-view scores (bar ≥9.0 every view; §D numbers cited)

| # | view | /10 | justification |
|---|------|-----|----------------|
| 1 | front | 7.0 | Strongest ortho: 31 matched edges (1 flagged, worst Δ−7.2° ±0.4° len 0.29 m @ (−0.89, 2.58..2.88) — sight-block edge), p95 Δtop 0.277 m (mast columns), yawProxy 1.6°. Loses tier on: NO mud flaps — ref presents pale buff flaps both corners (rects (100,420)..(175,540) & (462,420)..(537,540) luma 64.3, rgb 69,64,54) where proc shows exposed black wrap chevrons ((742,420)..(817,540) luma 31.3, min 1); TOGS body reads sand ((760,155)..(810,200) rgb 61,61,47, r=g, luma 59.6 vs ref face ctx 47.2 g-dominant); warm-grey glacis/travel-lock box ((908,310)..(1010,360) luma 59.6 vs ref glacis 46.8); blue chip family ×8 clusters (b−r ≈ +22, rgb ≈ 46,57,68: cheek periscope pair (1066..1095, 206..222), headlight pairs (767..799, 346..358) + (1120..1152, 346..358), roof chips (889..917, 128..134), (1000..1019, 184..190)); smoke banks read as slab crates, not the ref's angled tube clusters; gun presence small behind the boxes vs the ref's fat sleeve mass. |
| 2 | frontleft | 6.5 | Glacis one-rake + wing arch read honestly; 21 matched (10 flagged — the ≤0.42 m corner-bias family at printed ±4°, no-finding per §D calibration; worst real Δ+5.5° ±0.6° len 0.67 m upper @ (z 1.31..1.64, y 2.38..2.42) crown course). Docked: near-side gear band black (no discs), dust-cover grey boxes + sand sight cap at the gun root (crops fl-togs), blue chips, board courses read striped. |
| 3 | left | 5.5 | FLOOR. Ref: six pale dished discs with hubs/rims below the hem (band (210,360)..(370,390) luma 52.6 [26..70]), muted earth track. Proc: skirt (hem 0.615) + continuous outer board row (hem 0.515) seal the window; the slit that remains reads luma 15.0 ((850,381)..(1010,388), rows p5 ≈ 7) with only suspension-arm slivers; wheels NEVER read (verified geometry-level: crops-r7/gear-left*, wheel-L-mid-*, 6×+stretch — flat board faces + posts, zero discs). Two-layer shoes+pads and both end wraps DO articulate (§B6 trapezoid + raised idler (3.62,0.80) / sprocket (−2.64,0.80) visible). Chieftain5 r4 ratified anchor: wall-hides-gear = 5.0; +0.5 for the honest end articulation + real CR1 skirt/board identity above the hem (same mitigation grade as centurion5 r6). |
| 4 | rearleft | 6.0 | Same gear class from the quarter + the rear-quarter skeletal read: inboard panel + exposed run + ragged black wrap-shoe cloud + arm stalk against the hull (crops left-tail). Bustle reads as clean stacked crates vs the ref's rail-and-mesh basketry; no MG read. Silhouette honest: 33 matched, p95 Δtop 0.420 m is the tool's own vertical-edge cliff-offset family (Δbot −0.885 @ z 3.70 annotated as such), yawProxy 0.4°. |
| 5 | rear | 6.5 | Best edge count of the round (36 matched, worst Δ−5.5° ±0.4° len 0.28 m upper-right); recessed tail plate + deep boxes + asymmetric guard stubs compose honestly. Docked: NO rear flaps — ref (80,440)..(175,560) luma 57.0 vs proc exposed wrap (745,440)..(820,560) luma 19.6; bustle crate read + one isolated ring fitting floating at the stack's right edge (~(1090,230), O5d); lower rear plate bare vs the ref's exhaust/cable clutter; no MG read; blue chips. |
| 6 | rearright | 6.0 | Mirror of rearleft; TOGS rear mass is good identity but reads sand; the 2.40 kit plank tops the right bin row pale ((1060,280)..(1110,292) luma 65.0 vs box ctx 37.5 = +27.5). Ref-only wrap arcs at the quarter unmatched (ref 3 arcs, proc 1). |
| 7 | right | 5.5 | FLOOR. Same sealed-window read mirrored (crops gear-right, wheel-R-mid-*): board wall + black slit, zero discs; idler wrap articulates at the bow end. Same anchor arithmetic as view 3. |
| 8 | frontright | 6.5 | Mirror of frontleft: the right flank reads as one monolithic slotted panel wall; front quarter shows the raised idler wrap climbing (good §B6); worst real flag Δ−11.2° ±4° len 0.27 m (noise band). Docked: gear band, grey/sand root boxes, blue chips. |
| 9 | top | 6.5 | Plan silhouette tight (yawProxy 0°, plan rows carried the 90.1 gate) and §B2-clean. Docked: EXPOSED REAR TRACK RUNS — black shoe rungs ladder both rear quarters in plan (crops top-tail) where the ref's covered quarter reads continuous (evaluator: proc-only rear edges @ x ±1.11..1.14, z −4.05..−3.26; ref-only @ x 1.61..1.65, z −1.72..−0.69 = the outer-edge line our inboard panel loses); center-bow plan reads near-black vs the ref's lit nose (CERTIFIED geometry, not a hole — 0 sky px both sides of the tube vs the ref's own 29; tmp-cr1-r7-skytest); tan deck patches (kit plank, NBC) pop in plan; MG reads as an anonymous pill at (945..975, 146..153). |
| 10 | hero-frontleft | 6.5 | The garage hero: mass, stance, 11.5 m proportion, low L11 over the one-rake glacis — genuinely CR1. Docked: near gear band black with only deep-shadow wheel hints, wrap-shoe noise at the idler, grey dust-cover + sand caps at the root, board-course striping, blue chips. Evaluator ref-only 1.08 m edge @ (~z 2.30..3.09, y 1.62..1.89) = the ref fender line our course strips break. |
| 11 | hero-rearright | 6.5 | Rear ramp + sprocket wrap articulate handsomely (trapezoid visible); tail furniture stepped per ref. Docked: wrap tone noise, bustle crates + pale plank, TOGS sand, exposed rear rungs, no MG. The 0.002 m² enclosed void @ ~(1.94, 1.21, 3.42) VERIFIED a 5-px projection sliver between tube and bow edge (tmp-cr1-r7-voidcrop) — benign, no order. |
| 12 | hero-toptilt | 6.5 | Deck reads filled at 55° (§B2 0 sky in the void sweep); crown asymmetry + TOGS + NBC compose a real CR1 roof. Docked: the left fender line reads as three parallel course stripes (skirt top / board top / edge roll); tan plank + tan boxes; tail ladder rungs; MG absent; blue chips. Worst real flag Δ+7.2° ±0.6° len 0.56 m upper-left @ (~x −1.32..−1.16, z 2.38..2.82) — bin-course edge. |
| 13 | close-front | 6.0 | The §B1 money view and it HOLDS: glacis one plate, bow guard one co-planar rake, no terrace reads at close range; sleeve segmentation + fat collar + MRS read. Docked hard for close-range materials: oversized flat warm-grey travel-lock box + grey dust-cover pieces at the root; exposed black wrap faces with only guard-tip stubs where the ref hangs full pale flaps; smoke banks as crates (tubes don't resolve); sand TOGS + sight caps; blue chips; the split-face plinth wall catches light as a clean bright triangle at dead-front (correct §B1 authoring — tone/normal treatment only, SHOULD). Real angle finding: face rake Δ−3.1° ±0.1° on the 3.43 m upper-left edge (75.8° vs 78.9°) — small, sub-order, noted. |
| 14 | close-roof | 6.5 | Roof furniture stations verified (commander sight anchor, NBC, TOGS body with run-in head — the push-2 float class is gone; antenna pots+masts read acceptably). The flagged 0.055 m² enclosed void VERIFIED open background under the barrel (flood-fill: no enclosed sky component; §B2 machine 0) — benign, no order. Docked: large empty camo fields between clean boxes vs the ref's porthole/bolt detail; smoke banks read as two solid crates from above (ref: tube rows); commander station has NO weapon where the ref presents the pintle GPMG prominently; blue chips ×2; sand family. |

Mean 6.3 (88/14); floors 5.5 ×2. FAIL.

## Standing checks (§B + §D + §H.4)

- **§B1 front slopes + NO-STAIRCASES + SLOPE-MOTIVATES-THE-MASS: PASS —
  the family's best delivery.** Glacis is ONE raked plate (close-front
  1×); the bow guard course is one rake emitted as co-planar strips (the
  owner-screenshot staircase class verified dead in side/close/hero);
  the crown is genuinely asymmetric with the right cheek rake running
  out into its OWN low roof (slope motivates the mass — the plinth step
  wall is the ref's real course line); crown→rear-roof joint chamfered.
  The evaluator's ±14° flag family sits on ≤0.42 m edges at printed ±4°
  noise bands (§D calibration: corner-bias, NO-FINDING). Turret leading
  edge: Δ−3.1° ±0.1° vs ref on the main face rake — within tier.
- **§B2 contiguity/holes: PASS.** Machine contig 0. All three evaluator
  void flags adjudicated with numbers: close-roof 0.055 m² = OPEN
  background under the barrel (0 enclosed components, tmp-cr1-r7-voidcrop);
  hero-rr 0.002 m² = 5-px projection sliver; top-view bow Δbot +1.133 m
  = dark glacis GEOMETRY (0 sky px; ref's own zone carries 29). No
  see-through reads in 14/14.
- **§B3 decoration: PASS census, FAIL read (O5a).** mg1 (MAG, KIT
  fitting) but stowed at turret-local (0.35, 0.46, −1.22) yaw −2.55,
  buried inside the basket band — it reads as a pill in plan and nothing
  from the ground. Rich non-MG dressing (baskets, bins, cables, lights,
  TOGS, NBC, splash board, smoke banks) — but see O4/O5 tone reads.
- **§B4 containment: PASS.** 0/0 exact; wrap arcs clear the bow wings
  (the arch) and tail at 6× zoom.
- **§B5 turret parenting: PASS.** 0/0/0 by audit; bustle stack, plank,
  TOGS, antennas all turret-bucket (yaw pair not re-run — rest-pose
  audit + push-2 evidence carried).
- **§B6 track trapezoid: PASS.** \\________/ at both ends: front ramp
  0.51/m into the raised idler (3.62, 0.80, 0.28) + rear into sprocket
  (−2.64, 0.80, 0.33); both wraps articulate in side/hero views. The
  wrap-shoe TONE noise (ragged black chevron clouds, pale flecks) is O2.
- **§D discipline:** official rigs only; RIG PARITY OK 14/14; every
  tone/angle/sky claim above carries rects or evaluator numbers with
  noise bands; border-clip law honored (borderClips reported separately
  by the tool — none ordered); banked numbers re-derived fresh.
- **§H.4 VARIANT-DISTINCTIVENESS (chieftain5 5117b9a8, centurion3
  caa2e91c, centurion5 bbcf7d80 — hash-verified boards): PASS.**
  Garage-glance tells: (1) Chobham slab wedge turret with commander-high
  /loader-low crown vs chieftain5's rounded brow casting vs the
  centurions' basket bustles; (2) TOGS barbette beside the gun root — no
  sibling carries one; (3) full-length skirt + outer board layer system
  vs both siblings' exposed upper runs; (4) fat-collared, segmented
  thermal-sleeve L11 + MRS vs centurion L7 classes (chieftain5 shares
  the sleeved-L11 family but reads slimmer with the brow turret above);
  (5) stacked square bustle + tall kneed whips. CAVEAT (same shape as
  centurion5 r6): today the loudest side-view tell is the sealed black
  gear band itself, which is a defect — after O1 lands, tells 1–4 still
  hold. UK lineage reads distinct.

## Certified / no-order ledger (checked present, correctly NOT chased)

- side_whole wrap-zone bottoms z 3.46..3.98 (−0.05..−0.16 under the ref
  line): the packet's padHug coupling — **orchestrator lane** (plumbing
  padHugZ0 would touch the frozen centurions' live config). Not ordered;
  O1/O2 below are explicitly fenced off this band.
- plan rear lip cols ±0.31..0.73 @ −4.16 vs ref −4.06: dims-priced
  published-tail anchor cert. Not ordered.
- muzzle ridge/valley ±0.03 alternation; st0 wPct trim; hullLengthM
  stylization under dims 95 — packet certs, verified unchanged.
- Front parity yawProxy 1.6°/2.1° = ref's own skew, far under the 10°
  abort. Registration data.

## Orders — grouped by driver (gate-priced; whole 90.1 = 0.1 headroom is the wall)

Gate-hold binds every order: any geometry edit re-gates ≥90 all
components ×2 on final bytes, clip 0/0, holes 0, §B5 0/0/0, byte-stable
siblings (chieftain5/centurion3/centurion5 re-hash EXACT), and
invalidates this verdict per §G.

**O1 — EXPOSE THE RUNNING GEAR, BOTH SIDES** (clears both 5.5 floors,
lifts all four quarters + both heroes). Facts: board row authored as
eight 0.42-long segments at 0.431 pitch (gaps 0.011 — a visually
CONTINUOUS wall at x ±1.6055, y 0.515..1.525, z ≈ +0.89..−2.13, uk.js
challenger1Build); wheels are big (wheelR 0.41, dished, wheelZs 2.5..
−1.9) but zero of six discs read on either side; the leftover slit
renders luma p5 ≈ 7. The ref carries the SAME 0.515-hem layer reading
(r2 front-col evidence) yet presents six discs — its layer is SPACED
hangers/straps with wheels visible between, not a wall. Fix menu,
staged:
(a) MATERIAL (gate-free, do first): pale-olive dished wheel faces +
rim/hub contrast per the ref's 52.6-luma band; ambient-fill the gear
shadow zone so the window lands in the ref's 26..70 envelope.
(b) GEOMETRY: slat the board row to the ref's own hanger arrangement —
keep posts at the station/front columns that need the 0.515 hem (the
r2 front-col read + st2/st3 boss architecture), OPEN the spans between
so the discs read. Front-mask hem holds (posts still hang); side-mask
bottoms in the band are the SHOE line, below the boards (neutral); the
padHug cert band z 3.46..3.98 is fenced — do not touch it. Stage with
vertex-workorder columns; verify side_whole/stations ×2 (whole 0.1!).
Precedents: chieftain5 hem-parity (silhouette-neutral delivery, then
graduated) + centurion5 O1.

**O2 — GEAR-ZONE + WRAP TONE** (material, gate-free). The idler/
sprocket wrap shoes render as ragged black chevron clouds with pale
flecks (crops left-bow/left-tail); front/rear wrap faces behind the
absent flaps read luma ≈ 31/20 with min 0-1 against the refs' 57..64
flap panels. Lift chain/horn toward dark-olive, mud the pad faces,
kill the fleck contrast so the wrap silhouette edge reads smooth like
both refs. (Same class as centurion5 O2, same fix family.)

**O3 — MUD FLAPS, ALL FOUR CORNERS** (small geometry + material).
Ref presents big pale-buff flaps covering the track fronts and rears
(front rects: luma 64.3 both sides; rear 57.0); proc carries only the
0.16×0.30 guard-tip stubs at ±1.62. Author hanging flap panels at the
guard/fender tips per ref, pale rubber tone. §C per-row-grid clearance
MANDATORY (push-2 law 2) and the law-5 sweep caution is live at the
bow: the shoe sweep reaches z ≤ 4.065 vs the 4.047 §C boundary — hug
the wrap INSIDE the already-painted silhouette (mask-neutral: the wrap
paints those front/plan columns today) rather than hunting free z.
Gate risk LOW-MEDIUM; floaters 100 ×2 after.

**O4 — OFF-PALETTE FITTINGS FAMILY** (material, gate-free).
(a) Sand/tan → olive-dominant: TOGS body+head (rgb 61,61,47 vs ctx
47.2), commander sight cap (55.2 with 90-peak highlights), NBC pack,
the 2.40 bustle kit plank (65.0 vs 37.5 ctx). Keep the features — they
are identity (§H.4 tells) — retone toward the refs' g-dominant values.
(b) Warm-grey canvas: dust-cover wedge pieces + glacis travel-lock box
(59.6 vs 46.8) → olive-canvas.
(c) BLUE glass chips → near-black glass, b−r ≤ 0: eight front-view
clusters cited (rgb ≈ 46,57,68), plus the same material on roof
periscopes/close views. (centurion5 O4 class — same fix.)

**O5 — WEAPON + BUSTLE READS.**
(a) MG (the §B3 read): re-pose the stowed MAG so receiver mass + barrel
line read at 1× — dark crown-riding polarity over the bustle lids per
MG PHYSICS — inside the ≤0.4-pt pintle allowance. The packet's own
raycast note names the priced columns (+0.601/+0.861 plan to −2.05/
−1.89); turret headroom is 0.2 — stage pose candidates against
plan_turret/side rows per §C's PER-ROW-GRID law; chieftain5's line-762
crest-the-saddle pose is the working precedent. If no pose survives
the 0.2, deliver the commander-cupola station variant (real CR1 carry)
priced against front columns and report the trade.
(b) Bustle basketry: rails/posts/straps exist in source but never read
— tone-split rails vs canvas so the stack stops reading as crates.
(c) Smoke banks: the 2×5 tube clusters exist (smokeCluster ×2/side)
but resolve as solid boxes — tube-vs-bracket tone split (front tops
2.15..2.19 held; no geometry move).
(d) The isolated ring fitting at the bustle right edge (view-rear
~(1090,230)): attach it visibly or remove it.

**O6 — REAR-QUARTER PLAN COVERAGE** (small geometry, mask-neutral
class). Exposed black shoe rungs ladder both rear quarters in plan
(z ≈ −2.6..−3.9 at |x| 1.30..1.60) where the ref reads a covered
quarter; the plan columns there are ALREADY body (the track paints
them) so a thin cover/fender strip at the existing width is
plan-mask-neutral — verify §B2 (the push-2 gear-deck shelf lesson:
first cut enclosed 20 cells) and floaters ×2. Optional same-driver
dressing: lower rear plate pipework/cable per the ref's tail clutter
(KIT fittings inside the hull AABB).

SHOULD (≤0.4 allowance, tone-only): calm the dead-front highlight on
the plinth step wall (the split-face triangle) with a normal/tone
treatment — the geometry is correct §B1 authoring; it just reads
brighter than the ref's uniformly dark face.

## Honest positives (carry forward)

The §B1 arc is the program's exemplar: owner screenshot → staircase
kill → push-2, and every slope now survives a 6× zoom (bow rake
co-planar strips, one-plate glacis, chamfered crown joints, cheek rake
running out into its own low roof). §B6 trapezoid + raised end wheels
articulate visibly at both ends. Dims 95 under a certified −2%
stylization; floaters 100 ×3 runs; §B4 0/0 exact; §B5 0/0/0; the
skirt-course truth + station-boss architecture match the ref's own
layer system above the hem; TOGS/NBC/crown furniture stations all
verified where push-2 put them; both certified oracle classes (padHug
band, tail-lip anchor) correctly absorbed rather than chased. The 14
views carry no staircase, no hole, no float, no parenting defect — the
remaining distance to 9.0 is almost entirely MATERIAL (wheels, wraps,
flaps, palette, weapon read), which is the cheap half of the ladder at
0.1 whole headroom.

## Calibration note

Severity anchored to the RATIFIED chieftain5 r4 precedent (wall-hides-
gear = 5.0 → orders executed → graduate) as directed by the centurion
calibration ruling (f04beee): challenger1's sealed-window read is the
same class, half-graded UP (+0.5) for the same mitigations centurion5
r6 earned (real end-wheel articulation, two-layer track present, the
occluding layers being genuine vehicle kit). Same-hour cross-check:
my floors and mean land exactly on the centurion5 r6 profile (5.5 /
6.3) for statistically the same shared-hull read — the two verdicts
are calibration-consistent; no new flag raised.

## Evidence

- shots/critic-challenger1/ (14 fresh pairs, 12:15, hash 8ef58c18)
- shots/critic-challenger1/crops-r7/ (diagnosis crops: gear-*, wheel-*,
  front-bottom, rear-bottom, front-turret, top-bow, top-tail,
  roof-gunroot, roof-masts, rear-bustle, rr-bustle, fl-togs, left-tail,
  left-bow, hero-fl-gear, void-*, mg-*, h4-lineage-left)
- shots/visual-eval-challenger1/ (report.json + overlays)
- tools/tmp-cr1-r7-crops.py / -luma.py / -rects.py / -skytest.py /
  -voidcrop.py / -wheelprobe.py / -mghunt.py (every rect reproduces)
- Machine: gate ×2 start + ×1 end identical PASS lines, standard-check
  PASS, track-clip 0/0 exact, turret-parent 0/0/0 — this hash, this round
- Sibling boards: shots/critic-chieftain5/, shots/critic-centurion3/,
  shots/critic-centurion5/ (hashes verified this round)
