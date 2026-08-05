# centurion5 shaded-parity r6 — independent critic, FIRST formal adjudication (2026-08-05)

Bytes and rig integrity, verified by me this round:
- `tmp-hashgeo` centurion5 = **bbcf7d80** (39 meshes / 71732 verts) at
  campaign START and END — no drift; no uk.js edits landed during the
  campaign (git log c1ad424..HEAD on the profile: empty). Family watch:
  centurion3 **caa2e91c**, chieftain5 graduate **5117b9a8** — both EXACT.
- `node tools/geometry-gate.mjs --ids=centurion5` **×2: min 90.5 PASS
  both, identical lines** (hull 92.6 / whole 90.7 / turret 90.5 /
  stations 95.5 / dims 100 / floaters 100). This is the a20e801
  trim-boundary-amendment release reproduced exactly; the amendment is
  gate-side only (uk.js untouched by it — hash held through a20e801).
  Priced headroom for orders: **turret 0.5, whole 0.7, hull 2.6**.
- `tank-standard-check`: PASS (clip 0/20 ✓ in-band, contig 0 ✓, mg1+0d ✓).
- `track-clip-audit --exact`: front 0 / rear 20 vox (the packet's
  documented r6 sprocket-grazes-tail-loft class; kv2 band ≤60).
- `turret-parent-audit`: stranded 0 / abutting 0 / dangling 0.

Official rigs, fresh this round (FIFO lock queued honestly; my render
landed 10:19:42, the concurrent centurion3 critic queued behind at 10:20):
- `node tools/tmp-tank-critic.mjs --id=centurion5` → shots/critic-centurion5/
  (14 pairs, zero console errors).
- `node tools/visual-evaluator.mjs --id=centurion5` →
  shots/visual-eval-centurion5/ (report.json + overlays, camoSeed 4242).
  **RIG PARITY OK — no RIG MISMATCH: max yawProxy 1.4° (close-front),
  all 11 orthos ≤0.3°; frameOffset (0, 0.023, 1.205) is registration
  data.** Scoring valid.
- Tone/sky numbers: `tools/tmp-cent5r6-tone.py` (ITU-601 luma rects;
  sky = mask-method + blue-signature). Zoom crops were diagnosis-only;
  every verdict claim below cites official-render rects or evaluator
  numbers per §D.
- Mid-campaign law carried: **§B1 SLOPE-MOTIVATES-THE-MASS** (owner
  directive, c1ad424, docs-only — hash unaffected) folded into the
  standing checks and ordered where it fails at 1× (O3).

## HEADLINE: **FAIL — floor 5.5, mean 6.3 (standard first-round). Floors: view-left 5.5, view-right 5.5.**

front 7.0 · frontleft 6.0 · left 5.5 · rearleft 6.0 · rear 7.0 ·
rearright 6.0 · right 5.5 · frontright 6.0 · top 6.5 · hero-fl 6.0 ·
hero-rr 6.5 · hero-toptilt 6.0 · close-front 6.0 · close-roof 6.5

The geometry program delivered: registration, dims 100, stations 95.5,
slopes-at-the-mask and the r5/r6 retable all hold under fresh renders,
and the machine gates are green across the board. The shaded read is not
"same vehicle, same tier" yet: the running gear is invisible behind a
low-hem skirt wall on BOTH sides (the ref shows six Horstmann wheel
discs — a packet identity item), the two-layer track renders as a
near-black serrated band (luma p5 ≈ 1–7 vs the ref's 26..64 band)
with a pale pad strip at the ground line, and the cast-turret read is a
raked plate over a boxy core — the exact class the new §B1 clause names.
Headline evaluator fact: **0 paired arcs in all 14 views** — the ref
presents wrap/dome/casting arcs in 9 views (spans 81–165°); the proc
pairs none of them.

## Per-view scores (bar ≥9.0 every view; §D numbers cited)

| # | view | /10 | justification |
|---|------|-----|----------------|
| 1 | front | 7.0 | Strongest silhouette: 26 matched edges (1 flagged >1.5°, worst Δ−5.4° ±0.4° len 0.28 m @ (1.04, 2.78)), profile p95 Δtop 0.133 m. Loses tier on: full-height near-BLACK wrap faces both corners (rect (733,345)..(822,470) luma p5 1.0 / mean 29.1 vs ref band 41.5..63.7 — 0 sky px, geometry not holes); TAN hood panel pop behind the muzzle (rect (985,235)..(1030,290) luma 62.8 / p95 89.7, rgb 64,65,47 r≈g vs deck context 41.2 with g-dominant camo); pale muzzle end face (63.3 vs ref 57.9 with dark bore); 2 pale-blue periscope chips on the deck ((906,141)..(919,155) rgb 56,64,59 b≥r; (1018,156)..(1031,172)); cheek stacks read as crate walls. Ref-only cupola-dome arc span 104° @ (−0.82, 2.81, −0.11) unmatched — the proc's 3-ring cupola stack (2.695/2.795/2.85) reads stepped, not domed. |
| 2 | frontleft | 6.0 | 9/24 matched flagged (worst Δ−14.5° ±4.0 len 0.27 m @ (0.14, 2.54, 1.26) upper — crown-tab class; Δ−9.4° ±0.5° len 0.78 m @ z −1.41 lower-rear — serrated ramp-line class). Flank wall hides all six wheels (O1); black horn band + pale pad strip at ground; cheek rake meets the vertical side wall at a hard bright corner (§B1 O3). Ref-only wrap arcs span 116°/102° (sprocket @ (−2.76,0.95,−2.72), idler @ (1.71,0.86,1.76)) unmatched. |
| 3 | left | 5.5 | FLOOR. Ref: six olive wheel discs with rims + hubs below the skirt hem (row luma 25.8..62.6), muted two-layer track. Proc: skirt plane runs to ~y 0.34 with only gap-wedge notches — ZERO wheel discs read; below it the horn/pad row at luma p5 6.8 (near-black) + a pale dashed pad strip at the ground (p95 68.2 vs ref 56.2). 20 ref-only edges (the unmatched bogie/wheel set + ramp lines 154.7°/28.1° len ~1.15 m @ z −4.00/+1.93 y 0.18..0.25). Horstmann identity (packet brief) does not read. Same class as chieftain5 r4 view-left (5.0); half-graded up: the ref's own skirt sits lower than chieftain's (partial-disc exposure), and the proc lower band carries real two-layer track detail, panel bosses and a correct \\________/ trapezoid. |
| 4 | rearleft | 6.0 | Wall + rear wrap "C": black horn teeth around the pale sprocket-disc face; tail shelf courses read honestly (r5 overhang — good); bustle rear flat and empty vs the ref's basketed rear. Worst flag Δ−12.7° ±0.7° len 0.87 m @ lower-rear (serrated run edge vs ref's smooth ramp). Ref-only idler-wrap arc span 90° unmatched. |
| 5 | rear | 7.0 | 26 matched, profile p95 0.108/0.199 m; shelf courses + exhaust corner stubs compose well. Held back by: EMPTY tail plate — ref drapes a tow cable in a double-U with end fittings and carries spare-link teeth at the shoulders, proc has neither (O5); flank baskets read as plain slabs (ref shows a dotted/perforated weave); black wrap columns with pale slat rows at both corners (same rects class as front). |
| 6 | rearright | 6.0 | Mirror of rearleft (worst flag Δ+13.5° ±0.7° len 0.90 m lower-rear; ref-only wrap arcs 93°/140° unmatched). Right flank wall + black band; tail composition partially compensates. |
| 7 | right | 5.5 | FLOOR. Same read as left, mirrored (ref-only ramp lines 26.2°/152.0° len 1.14 m @ z −4.03/+1.94; ref-only arc span 154° @ (−0.05, 2.46, −2.22) — the rounded bustle rear the proc answers with straight rails). The Mk.5 flank basket box reads as a plain pale slab. |
| 8 | frontright | 6.0 | 6/20 flagged (worst Δ+14.3° ±0.8° len 0.34 m @ (0.60, 2.83, 0.50) upper — crown-tab class; Δ+10.6° ±0.5° len 0.82 m lower-rear ramp class). Wall + both-end black wraps; cheek-rake hard corner; discharger tube rack itself reads well at this angle. Ref-only sprocket arc span 139° unmatched. |
| 9 | top | 6.5 | Tightest profile of the round (p95 Δtop 0.073 m; turret_plan carried 96.9 at the gate) and the certified phantom-stern-band edges @ z −4.86 stay properly unmatched (no order — v10 cert). Loses tier on: BLACK track strips with pale pad dashes popping at the rear quarters where the ref keeps its runs shadow-muted; the turret roof reads as rectangle tiling (crown ridge + step tabs + bustle rails as pale straight edges) vs the ref's one organic casting; tan hood visible in plan at the gun root; procOnly 25 edges = panel-line clutter. |
| 10 | hero-frontleft | 6.0 | The garage hero. Mass, stance, tube length and fender line genuinely read Centurion; broken by the flank wall (no gear), the bow teeth-on-pale-disc glitch, the cheek rake dead-ending into the vertical wall with stacked crown slabs behind (§B1 — worst flags Δ−14.2°/Δ+10.7° at crown tabs), the tan hood wedge and roof blue chips. Ref-only idler arc span 128° unmatched. |
| 11 | hero-rearright | 6.5 | Best 3/4: tail shelf + exhaust stubs + basket boxes give the rear real composition; wall and black wraps still own the lower third; bustle corners hard-boxed vs the ref casting (ref-only casting-shoulder arc span 165° @ (1.76, 2.60, 2.26) unmatched); Δ+12.0° ±0.4° len 0.93 m ground-line class. |
| 12 | hero-toptilt | 6.0 | Rectangle city from tilt: stacked crown slabs with pale edge rails, shelf tabs as plain boxes, black bow track segments popping at both corners (ref keeps them under fender shadow). Deck furniture placement honest (log, cables, hatches all olive-verified — the "brown log" reads olive by numbers, rgb 47,49,39 r−g −2, no order). MG reads as a leaning stick, not a weapon (O6). |
| 13 | close-front | 6.0 | The bow test. Glacis itself is the round's best §B1 read — ONE rake, driver-step single-plane (r5 law honored, no staircase at 1×). Broken by: pale idler DISC ringed by black horn teeth inside the near wrap (the chieftain "teeth-on-pale-disc" glitch class, now at the bow), far-side wrap as a full black mass, tan hood + pale muzzle face + roof chips ((735,222)..(800,235) region), and the falling horn-tip courses reading slightly choppy over the wrap. Worst flags are crown-region ±4° noise-floor classes; profile p95 0.164/0.063 m is honest. |
| 14 | close-roof | 6.5 | Crown furniture stations all verified (cupola at x −0.48 / z −0.15, gunner sight 2.545, periscope hoods, vane as the 2.92 p95 anchor — dims-sovereign, certified). M2 present WITH ammo cans but stowed dark-on-dark and reads as a pipe at 1× (O6). Slab-stack crown + cheek plate corner + tan panel (48.4 vs flank 42.5) + blue chip (rect (1066,303)..(1078,316) rgb 43,49,50 b>r). Two evaluator enclosed-voids (0.014/0.013 m² @ (−0.47, 2.02, 3.55) / (−0.53, 1.86, 3.98)) VERIFIED dark geometry: 0 sky px under mask-method+blue-signature — hood/tube shadow gap, no §B2 order. Ref-only 165.0° len 5.55 m lower silhouette line = the serrated black bottom breaking the edge detector (O2 corollary). |

Mean 6.3; floors 5.5 ×2. FAIL.

## Standing checks (§B + §D + §H.4)

- **§B1 front slopes + NO-STAIRCASES + SLOPE-MOTIVATES-THE-MASS: MIXED.**
  HULL PASS: the glacis is one raked plane with the r5 one-rake driver
  step (no quantization read at 1× in side/close-front); the tail shelf's
  three monotone raked courses read as authored plate courses with
  co-planar joints, not stair quantization. Bow horn-tip slivers follow
  the ref's own falling line. TURRET FAIL under the new clause (O3): the
  cheek rake is a plate SET over a vertical-walled box — the rake
  dead-ends into the flank wall at a hard bright corner (close-roof,
  hero-fl, frontleft/frontright at 1×), the crown ridge + step tabs stack
  BEHIND the rake as separate slabs (flag family Δ−14.5°/−14.2°/+14.3°/
  +10.7° at (0.14–0.77, 2.5–2.98) crown coordinates), and the cupola
  reads as 3 stacked rings where the ref presents a 104°-span dome arc.
  "Appliqué-slope over a rectangular silhouette" is the law's own words
  for this read.
- **§B2 contiguity/holes: PASS.** Machine contig 0; flood-blue applied to
  every dark-zone claim: front wrap columns 0/11125 + 0/11250 sky px;
  close-roof void rects 0/2800 sky px (warm near-black interior — the
  revolution-r7 inflation class avoided). No see-through reads in 14/14.
- **§B3 decoration: PASS census, WEAK read.** mg1 (M2 as KIT fitting,
  §H.4 tell vs the Mk.3's MAG) + glacis cables, cleats, log, baskets,
  dischargers. The M2 reads as a stick at 1× (O6, SHOULD).
- **§B4 containment: PASS.** 0 front / 20 rear vox in the documented
  band; renders show wrap arcs clear of hull solids; bow/stern wrap
  geometry clean at 4× zoom.
- **§B5 turret parenting: PASS.** 0/0/0; bustle furniture, baskets and
  MG all yaw with rig_turret by audit.
- **§B6 track trapezoid: PASS.** \\________/ reads at both ends: ramps
  rise to the raised idler (y 0.96 r 0.345, wrap crown 1.50) and raised
  sprocket (z −2.95, y 0.99, r 0.37; wrap bottom 0.843 @ −3.48 cert);
  contact patch 2.50/−2.32 per the r6 fits. The evaluator's ±12–13.5°
  lower-rear flags are the serration TONE breaking the ramp line-read,
  not a shape defect (O2), and the certified station-0 trim class is
  respected.
- **§D discipline:** official rigs only; parity clean; every angle/arc/
  tone claim above carries evaluator numbers or ITU-601 rects
  (tools/tmp-cent5r6-tone.py reproduces end-to-end); border-clip law
  honored (3 borderClips/view in fronts left unordered); certified
  classes (vane anchor tax 4 side cols, zb 1.28 col, station-0 trim,
  phantom stern band, 20-vox graze) checked present and NOT ordered.
- **§H.4 VARIANT-DISTINCTIVENESS (family: centurion3 caa2e91c,
  chieftain5 5117b9a8): PASS with one sharpening order.** vs
  centurion3 at a garage glance: (1) bustle-FLANK canvas basket boxes
  both sides (c3 bare); (2) roof kit — M2 + commander-sight vane cluster
  vs c3's MAG; (3) mk5 periscope hump on the glacis; (4) the L7
  extractor drum — WEAK: authored to the print's own band (offset drum
  top-biased +0.0405, r 0.170, live band 2.115..1.776 — gate-priced,
  correct) but at 1× it reads as a low top-line hump nearly identical to
  c3's slim tube; the packet's identity line ("the distinctive evacuator
  drum, unlike the slim 20-pdr") deserves a TONE split (O6b), never a
  geometry fattening (the r5 lesson: the r4 "fatten 0.03" was mask AA).
  Front views of the two marks read near-identical — the tells live in
  side/3-4 views. vs chieftain5: unambiguous (L7 vs sleeved L11, skirt
  wall vs exposed gear + terraced bins, basket bustle vs NBC pack).
  Caveat mirror of chieftain r4: today the loudest c5-vs-chieftain tell
  is the skirt wall itself, which is a defect — after O1 lands, tells
  1–3 still hold.

## CALIBRATION FLAG for the orchestrator (cross-critic split, same round)

The concurrent centurion3 first adjudication (8df280f) scored the SAME
shared-hull reads — gear contrast, black band, slab grammar — as a
material-lane 8.4–8.6 profile. I measured the two REFS' wheel rows
IDENTICAL (both luma mean 51.3, p5 25.8, p95 62.6/62.7 — same print
family, same exposure) and both procs carry the same wall; the same
pixels cannot be 8.6 and 5.5 under one bar. My anchor is the RATIFIED
family precedent: chieftain5 r4 scored wall-hides-gear at 5.0
("identity failure"), its orders were executed, and the tank graduated
— that calibration produced a graduate. I half-graded UP from it (5.5)
for the centurions' honestly-lower ref skirt and richer proc lower band.
One of the two calibrations needs an owner/orchestrator ruling before
the next centurion round prices its push; my orders below are correct
under either severity — only the distance to the bar changes.

## Orders — grouped by driver (gate-priced; turret 90.5 = 0.5 headroom, whole 90.7 = 0.7, hull 92.6 = 2.6)

Gate-hold binds every order: any geometry edit re-gates ≥90 all
components ×2 on final bytes, clip in-band, holes 0, byte-stable
siblings (centurion3 caa2e91c and the five uk graduates re-hash EXACT),
and invalidates this verdict per §G.

**O1 — EXPOSE THE RUNNING GEAR, BOTH SIDES** (geometry: skirt hem
family; clears both 5.5 floors and lifts all four quarters + both
heroes). The main skirt plane runs to ~y 0.34 and the wheel row never
reads — the ref shows six disc faces with rims/hubs below its hem on
BOTH marks. Cut the hem back to the ref's own line (the outer-strip
band bottoms at 0.81 per the r2 tables; the ref's exposed-disc zone
reads y ≈ 0.6 down to the track), expose the dished wheels (they exist
in buildRunningGear — dished faces + hub per the r1 packet), and where
side-mask BOTTOM rows need the current low line, own them per §C with a
material split below the idler-wrap line instead of geometry — the
sanctioned pattern, and exactly how chieftain5 delivered its "LEFT HEM
PARITY" order silhouette-neutral (its stations held at the gate).
Gate risk LOW-MEDIUM: the hem line lives in hull side rows at the
±1.56..1.66 columns where the mask bottom is the 0.575 track band, but
stage with `vertex-workorder` columns before committing (hull has 2.6
headroom; whole 0.7 — verify side_whole).

**O2 — TRACK/WRAP TONE** (material: track family; clears the black-band
+ teeth-on-pale-disc + pale-ground-strip classes in every view; lets
the ref's 9 wrap arcs pair). (a) Horn/pad row floors at luma p5 1–7
(side band, front/rear wrap faces — rects cited at views 1/3) against
the ref's 26..64 envelope: lift the chain/horn material toward
dark-olive and mud the pad faces; kill the pale pad strip at the ground
line (proc p95 68.2 vs ref 56.2). (b) Idler/sprocket disc faces read
pale gray inside black teeth (bow: close-front; stern: rearleft/
rearright) — drop toward the ref's rgb ≈ (47,52,42) wheel tone. Target:
the whole gear zone lives in the ref's 26..64 band. Gate-free
(materials; §C material-split law).

**O3 — CAST-TURRET READ under §B1 SLOPE-MOTIVATES-THE-MASS** (geometry,
interior-shading at HELD silhouette columns; clears the slab reads in
frontleft/frontright/top/heroes/close-roof and the front dome arc).
(a) Cheek-to-wall: the raked cheek plate dead-ends into the vertical
flank wall — blend the joint (chamfer strip continuing the rake's own
line into the wall plane) inside the r6 turret_plan columns (96.9 —
they are the guard rail). (b) Crown grammar: ridge + 2.60 step-tab +
riser currently stack as separate slabs behind the rake (the ±14° flag
family at (0.14–0.77, 2.5–2.98)); re-plane them co-planar/chamfered
onto the rake per FLAT-CAP-BEHIND-A-RAKE. (c) Cupola: 3 stacked rings →
one domed read (the ref presents a 104° arc @ (−0.82, 2.81)); facet the
transition inside the certified 2.85 class (the p95 anchor is the VANE,
not the cupola — dims safe). (d) Bustle corners: ease the hard boxes
toward the ref's rounded plan-rear (the r6 width-stepped strips exist —
add the chamfer reads). Gate risk MEDIUM: turret_side 87.2-class rows
own these columns and turret headroom is 0.5 — every step verifies
against the official gate between batches (the r6 six-batch pattern),
and the trim-boundary columns (the amendment class) must not be
re-poisoned (dAlong 1.237 frozen).

**O4 — OFF-PALETTE FITTINGS** (material; clears pops in front/top/
heroes/closes). (a) TAN canvas hood: keep the feature (real Centurion
kit and an §H.4 tell vs chieftain), retone from rgb (64,65,47)/p95 89.7
to the ref's own hood value rgb ≈ (56,62,47)/p95 ≤ 73 (g-dominant, capped
highlights) — rect targets in tmp-cent5r6-tone.py. (b) Blue periscope
chips ×3 (front deck ×2, turret roof ×1 — rects cited) → near-black
glass, b−r ≤ 0. (c) Muzzle end face: pale ring 63.3 → dark bore read
per ref 57.9-with-dark-center. (d) Cheek-stack box tops read faintly
warm (r−g +3 vs context −7) — nudge olive (minor). Gate-free.

**O5 — REAR DRESSING** (fittings; clears the empty-plate read in
rear/rearleft/rearright/hero-rr). Drape the tow cable across the tail
plate per the ref's double-U with end fittings (KIT.towCable; the deck
cables exist — the TAIL run is what's missing) + spare-link teeth at
the shoulder racks; give the two flank baskets their weave read (the
ref's dotted texture) at tone level. AABB law: fittings stay inside the
hull AABB (§C); floaters 100 ×2 required after.

**O6 — SHOULD (≤0.4 pt allowance + §H.4 sharpening):** (a) raise/yaw
the stowed M2 so receiver mass + barrel line read in roof/rear-quarter
views (dark crown-riding polarity per MG PHYSICS). (b) Give the L7
extractor drum a distinct band tone (§C material split — geometry is
gate-priced and correct) so the Mk.5/2's canonical tell reads vs the
Mk.3 at garage distance.

## Honest positives (carry forward)

Dims 100 ×2 with the vane anchor inside grace; stations 95.5 (the r6
ramp-pad law holding under fresh renders); glacis one-rake + driver
step = the family's best §B1 hull read; tail shelf courses honest;
turret plan silhouette tight (96.9 gate columns confirmed by the 0.073 m
top p95); §B4/§B5 the cleanest I have audited in this family; both
certified oracle classes (phantom stern band, station-0 trim) correctly
absorbed rather than chased; the r5 two-threshold and P95-ANCHOR-X-COST
laws visibly paying (no mast/anchor artifacts anywhere in 14 views).

## Evidence

- shots/critic-centurion5/ (14 fresh pairs, 10:19)
- shots/visual-eval-centurion5/ (report.json + overlays, 10:20)
- tools/tmp-cent5r6-tone.py (verdict rects, reproduces end-to-end)
- Machine: gate ×2 PASS lines, standard-check PASS, track-clip 0/20,
  turret-parent 0/0/0 (this round, this hash)
- Sibling boards for §H.4: shots/critic-centurion3/ (fresh, queued
  render), shots/critic-chieftain5/ (graduate board, hash-verified)
