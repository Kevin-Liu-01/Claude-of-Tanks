# chieftain5 shaded-parity r5 — independent critic, SECOND adjudication (2026-08-04)

Gate re-verified this round on current bytes (HEAD f533a08): **91.2 min PASS**
(h91.7/w91.2/t93.8/st92.9/d100/f100), standard-check FULL (clip 0/0 exact,
holes 0, contig 0, mg1), track-clip 0/0 exact. Official rigs fresh:
- `node tools/tmp-tank-critic.mjs --id=chieftain5` → shots/critic-chieftain5/ (14 pairs)
- `node tools/visual-evaluator.mjs --id=chieftain5` → shots/visual-eval-chieftain5/
  RIG PARITY OK: max yawProxy 1.3° @rear, ortho dCentroid ≤0.101 m — no
  RIG MISMATCH, scoring valid.

**VERDICT: FAIL — min 7.0, mean 7.5** (r4 was min 5.0 / mean 6.4; floors
+2.0, mean +1.1). All five r4 order families verified DELIVERED in the r4
windows (§1 below) with zero regressions found. What remains between 7.5
and 9.0 is one dominant driver — the turret/hull still read PLATE-TILED
where the Chieftain is cast-organic — plus a small polish family (tone
chips, left-hem read, one gun-line kink). No new geometry-scale defects.

## 1. r4 order verification (all in the r4 evaluator/tone windows)

- **O1 left gear EXPOSED — DELIVERED.** The r2-era ground wall is gone;
  six wheels + idler + sprocket render below the kept lip. Gear-zone rect
  (700,345)..(1065,395) view-left: p5/mean/p95 **25.8/52.8/63.3** vs ref
  25.8/53.3/65.3 (r4 wall read p5 6.8/mean 47.1). Background-air parity in
  the gear band: proc 2670 px vs ref 2722 (view-left), 5910 vs 6254
  (view-right) — no false walls left. Honest residual priced below (§4
  O2): the hem sits at the r4-ordered ~0.60 line, 0.19 m below the ref's
  wheel-top hem, so the wheels read ~half-exposed vs the ref's full discs,
  and the five gap tabs read as furniture in 3/4 views.
- **O2 gear tones + bow bay — DELIVERED.** Rear corner columns rect
  (745,395)..(800,575) view-rear: mean 19.5 → **63.3** vs ref 63.5 (p5 55.0
  vs 51.9) — dead in the ref band. Rearleft sprocket-C rect
  (1010,340)..(1105,420): p5 **25.8**/p95 70.6 vs ref 25.8/76.1 (r4 glitch
  read p5 ~7 on p95 ~70 discs) — the zipper class is dead in all four
  affected views. Close-front bow bay reads closed (flaps + toned wrap);
  containment stayed 0/0 exact.
- **O3 off-palette kills — DELIVERED with two small new chips (§4 O3).**
  Tan plate rect (925,225)..(995,250) view-front: the tan HUE is gone —
  the >70-luma pixels there are now pale-OLIVE (mean rgb 78,84,61, g>r)
  — but the zone still pops vs ref (rect p95 90.7/mean 63.0 vs ref-mirror
  68.1/54.9; the builder's own packet admits detail tint reads 62
  up-facing vs ref 48.6). Searchlight pane: warm-gray door rgb (65,62,55),
  luma 62.6 with r>b (r4: 58.9 with b≥r), one ~2 px glint at (848,234)
  rgb (46,57,68) — sanctioned. Plan lids: warm-cell census (r>g+8, L>55,
  >25 px/cell) = ZERO cells on the proc half (r4 had 6–8 brown lids); ref
  half also zero (its tarp reads dull 56,54,46) — plan reads
  casting-on-hull.
- **O4 cast forms — DELIVERED on the rig.** (a) Chin: the r4 left-view
  177° vs 163° (Δ+14°) finding is GONE (the ref 163° len 0.44 line is now
  refOnly against proc bevel facets; left profile p95 Δbot 0.053 m).
  (b) Collar: cone stack reads in front/close-front (no bracket boxes).
  (c) Sleeve: top plan procOnly ONE straight line x −0.247, z 3.49..6.92
  vs ref x −0.24 (r4: −0.34 + step); top profile p95 Δbot 1.185 → 0.376 m;
  RIGHT view gun bottom now matches BOTH ref broken lines — ref 179.8/proc
  179.1 len 2.52 m @ z 3.15 AND ref 178.0/proc 179.2 len 2.17 m @ z 5.95
  (r4: one 179.6° 4.48 m line) — the sleeve→tube step reads. (d) Belly V:
  the front ±5.5°/rear ±4.4° horizontal-edge findings are GONE (front now
  38 matched/3 flagged, worst +4.3° on a 0.36 m near-vertical edge).
  Casting shoulder: the r4 refOnly falling-shoulder lines (164.8/165.1/
  159.9°) no longer appear as ≥0.4 m unmatched edges in rearright.
- **O5 MG read — HONEST PARTIAL as claimed.** Close-roof: receiver mass +
  barrel line read clearly crossing the olive bustle lids (crop verified);
  toptilt: modest but present by the cupola; rear-quarter: marginal (a
  dark post among antenna bases). Garage-distance ortho read remains
  weak. Within the ≤0.4-pt pintle allowance; census mg1.

## 2. Per-view scores (bar ≥9.0 every view; r4 line in parens)

| # | view | /10 | justification (rig numbers per §D) |
|---|------|-----|-------------------------------------|
| 1 | front (7.5) | 8.0 | 38 matched (3 flagged, worst +4.3° len 0.36 @ (0.887,0.131)); Δtop/Δbot p95 0.104/0.086 m. Collar cone stack + dark searchlight + olive corners land. Holds: cheek band still slab-stack vs cast sweep (ref-only shoulder arc r 0.246 span 123.7° — chord-limit class, radius-authored per packet, accepted as cited); under-collar band pale (rect p95 90.7 vs ref 68.1); ref corners read warm dusty vs proc olive-dark stubs. |
| 2 | frontleft (5.5) | 7.0 | Wall gone, wheels read. 24 matched but 12 flagged: wing-shelf blends Δ−10.6° (len 0.61 @ z 3.23) / Δ−9.0° (0.90 @ z 2.62) — mask-priced 3D form (protected, W1 tops at ref's own 1.34/1.249 cols); Δtop p95 0.289 m = crown boxes. Hem tabs read as dark teeth under the skirt; cheek is one canted slab vs cast. |
| 3 | left (5.0) | 7.5 | Identity CURED: gear + tones in ref band (rect cited §1), chin reclines (Δ+14 gone). Holds: wheels ~half-exposed vs ref full discs (hem at ordered 0.60 vs ref wheel-top ~0.79); gun underside kink Δ−11.3° ±4 len 1.05 m @ z 4.63 y 1.70 (sleeve→evac); ref bow-wrap arc r 2.174 span 60.1° unmatched (wing-tip dAlong protection honored). |
| 4 | rearleft (5.5) | 7.5 | Sprocket-C glitch dead (p5 25.8 in ref 26..76 band). 27 matched, worst −8.7° len 0.34 (turret upper, short). Holds: tabs read as dark pillars over the gear; rear-wrap arc r 1.289 span 104.6° unmatched — stern lower corner squarer than ref sweep; boxy bustle. |
| 5 | rear (7.0) | 8.0 | Corner columns 63.3 vs ref 63.5 — the r4 zipper class dead both sides; belly edges clean (−1.7° lower flags only). Holds: bustle flatter/emptier than ref bulged stowage (r4 note, never ordered); NEW small chip — tan wood lump at right-rear fender rect (745,335)..(763,350) luma to ~110 rgb (135,108,78), the brightest thing on the rear (ref warm accents ≤ ~80); short upper-edge flags ±8-12° on bin/rail ends. |
| 6 | rearright (7.5) | 8.0 | Casting-shoulder roll landed (r4 falling-line refOnlys gone; hull run at ref 2.2325). Holds: flank bins read as ONE co-planar wall bow→stern; Δ−12.3° len 0.29 far-side upper-rear + Δ+7.9° len 0.30 (shoulder transitions, short); the wood chip reads (26 px). |
| 7 | right (8.0) | 8.5 | Sleeve→tube step matched to BOTH ref lines (§1 O4c); gear layering ref-true; 22 matched, worst −4.3° short. Holds: flank above fender still slabbier than ref; small turret-top flags (+6.6/−6.5 short edges); ref lower-rear 28.4° len 1.21 rake unmatched @ z −2.95 (stern wrap sweep). |
| 8 | frontright (7.0) | 7.5 | Collar cone + octagon sleeve read; corner flaps toned. Holds: wing-shelf Δ+10.7° len 0.44 (protected class); cheek boxes; Δtop p95 0.289 m crown boxes; glacis-blend arc r 1.078 span 67.9° unmatched (protected cols). |
| 9 | top (6.5) | 7.5 | Palette cured (zero warm cells; ONE straight sleeve line at x −0.247 vs ref −0.24; p95 Δbot 1.185 → 0.376 m). Holds: turret plan = saucer fenced by rectangles vs ref cast oblong; rack corner Δ−9.9° len 1.26 @ (1.631,−1.222) (builder-deferred, priced cols); fender fronts ±5.5/5.8° len 0.71; muzzle-tip ±2.8/7.6°. |
| 10 | hero-frontleft (5.0) | 7.0 | Floor cured: wheels visible, no wall, sleeve step + cone collar read. Holds: the hero read is dominated by the single canted cheek slab + fenced crown (ref arcs r 1.46/1.254 unmatched); tabs read as teeth; gear zone reads darker than ref's dusty band. |
| 11 | hero-rearright (6.5) | 7.5 | Gear + shoulder much improved; terraced bins read. Holds: Δ+14.8° len 0.51 @ (1.184,2.211,3.117) collar/cheek edge from behind; bins co-planar wall; wood chip (53 px, L to 135); wheels dark at this angle vs ref pale discs. |
| 12 | hero-toptilt (6.0) | 7.0 | Lids cured, saucer partially reads, MG present. Holds: rectangle-city crown — bin fence + plate tiling vs ref one-casting read; chip visible at right edge; toptilt flags +13.1/−9.6/+8.8 on tile/fence edges. |
| 13 | close-front (5.5) | 7.0 | Bay closed, collar conical, sleeve octagon reads cylindrical enough. Holds: sleeve→evac Δ−10.7° ±0.5 len 0.71 @ z 4.80 (persists after two fits, real at 11° vs ±4 band); chin lower-front Δ−8.7° ±0.7 len 0.61 @ z 4.83 (prow underside rake 44.7→36.0); warm-gray ring at sleeve root reads mauve vs green family (rgb ~66,63,56 vs surround g−r +5..+10); pale band under collar (p95 91). Δtop p95 0.421 m is the close-crop mast back-projection class (r4 treatment: crop artifact, ortho masts clean). |
| 14 | close-roof (6.5) | 7.5 | MG READS (receiver + barrel over bustle); chin bevels replace the quad staircase; lids olive. Holds: W3 nose-roll Δ−21.1° len 0.61 @ z 3.61 (r4 registration-poison coin — PROTECTED, no order); crown plate-tiling at close range; the ring band visible at sleeve root; pale plate right of sleeve. |

Min 7.0 (frontleft, hero-frontleft, hero-toptilt, close-front), mean 7.5. FAIL.

## 3. Standing checks (§B + §D + §H.4)

- **§B1 front slopes: PASS.** Glacis rakes per print; belly V now rises
  outboard (r4 findings gone from the digest); no flat-front violations.
- **§B2 contiguity/holes: PASS.** Machine top-down scan 0 enclosed cells.
  Evaluator voids eyeball-verified: close-roof 1.605 m² = air between tube
  underside and deck (ref shows the same air); close-roof 0.013 m² =
  under-sleeve pocket; hero-rearright 0.007/0.003 m² = track-region shadow
  pockets. No sky-through-hull in any of the 14 views.
- **§B3 decoration: PASS (census mg1), MG read now genuine at close-roof**
  (§1 O5); remaining dressing is the r4 packet-justified hand-authored set
  (censuses 0d by design).
- **§B4 containment: PASS.** Audit 0/0 exact; bow wrap under the wing
  shelves, flaps forward of the wrap end per packet (bottoms 0.31 ≥ ref
  0.305); rear wrap clear.
- **§D rig discipline:** both official rigs fresh this round; parity OK
  (1.3°/0.101 m); every shape claim above carries evaluator numbers with
  noise bands; tone claims are ITU-601 luma rects with coordinates on the
  fresh critic renders; banked r4 numbers re-derived fresh before re-use.
- **§H.4 VARIANT-DISTINCTIVENESS vs built UK family: PASS, tells verified
  against fresh centurion5 pairs (shots/critic-centurion5/).** At a
  glance: (1) mantletless conical collar vs centurion mantlet bulge; (2)
  L11 reach with sleeve step + extractor vs short 20-pdr/L7; (3) NBC pack
  + full-width rear basket vs bare bustle; (4) skirted terraced-bin flank
  vs exposed upper track run; (5) cupola + searchlight cheek cluster
  (still a distinct box mass with the dark door). The r4 caveat is
  resolved: the wall-tell is gone and distinctiveness SURVIVES on legit
  tells. The r5 retones did not erase any tell.

## 4. Orders — grouped by driver (what stands between 7.5 and 9.0)

Gate-hold binds every order (§G: any geometry edit invalidates this
verdict): re-gate ≥90 all components ×2 identical decimals on final
bytes, clip 0/0, holes 0, siblings byte-stable. PROTECTED, do not touch:
wing-tip columns (close-roof W3 nose-roll, bow-wrap/glacis-blend arc
columns — the r4 dAlong-poison law), W1 wing-shelf silhouette tops
(side_hull-priced at ref 1.34/1.249 cols), the −0.292/−0.3 plan-turret
marginals. Interior-shading at held silhouettes is the legal pattern
throughout (the O4a chin precedent).

**O1 — CAST-READ SHADING PASS** (the dominant driver; clears frontleft,
frontright, top, hero-frontleft, hero-toptilt, close-roof and lifts every
3/4). All inside held silhouette columns. (a) Cheek slabs: each front
cheek is ONE canted quad — break into 2–3 rolled shading facets with
graded tone (kill the flat-quad read exactly as O4a killed the chin's);
the hero-rearright Δ+14.8° @ (1.184,2.211,3.117) and rearright −12.3/+7.9
short flags all live on these cheek/shoulder transitions — roll them.
(b) Crown fence: the bin boxes ringing the crown read as a picket fence
in top/toptilt — step their heights (mind the heightM p95 budget: ≤4 side
columns above published height, aligned with the ref's own spikes) and/or
darken their crown-facing faces so the saucer reads through the gaps.
(c) Extend the existing r 0.045/0.05 quarter-round crest treatment to the
cheek→crown transition so 3/4 views inherit the shoulder roll.

**O2 — LEFT HEM PARITY** (small geometry, priced; clears the left-family
residual). The delivered hem sits at the r4-ordered ~0.60; the ref's hem
is at the wheel-top ~0.79 line, so proc-left wheels read ~half vs the
proc's OWN right side (~full). Stage with vertex-workorder (the certified
left-shift print makes left rows sensitive — r1 lesson): raise the hem
run toward wheel-top over the wheel span if the rows allow; if they
refuse, pull the five 0.045-m tab BOTTOMS up to ~0.72 and drop tab faces
to shadow tone so they read as shadow, not furniture (rearleft/frontleft
pillars-over-gear read).

**O3 — TONE CHIPS** (material only, one round). (a) Warm-gray ring/taper
at the sleeve root reads mauve against the green family in
close-front/close-roof/right (rgb ~(66,63,56), r≥g, vs surround g−r
+5..+10) — rebucket to family olive metal. (b) Wood lump at right-rear
fender: luma to ~135 in 5 views (rear rect (745,335)..(763,350)) — drop
to the ref tarp band (≤~80) or rebucket; ONE dull brown accent stays
sanctioned. (c) Under-collar band: up-facing detail tint 62 vs ref 48.6
(front rect p95 90.7 vs 68.1) — pull the tint constant toward the ref;
this is the last of the r4 tan-box family.

**O4 — SLEEVE→EVAC THIRD FIT** (small, priced): the Δ−11.3° (left, len
1.05 @ z 4.63) / Δ−10.7° (close-front, len 0.71 @ z 4.80) kink survived
two taper fits — try ONE long blended taper across z 4.47..4.95 (or
shave the swell peak 10–15 mm) minding live cols 4.586 (err 0.020) and
4.829 (exact). If the columns refuse, document the third attempt and
leave — this alone does not block 9.0.

**O5 — BUSTLE BULGE (SHOULD, fittings):** rear/heroes read the bustle
flat vs the ref's bulged stowage — add 1–2 KIT stowage masses (duffel
class) INSIDE the basket envelope (no AABB change, §C) to answer the
ref's rounded masses. Unordered in r4; cheap now.

NOT ordered (protected or no-finding): wing-shelf 3/4 blends (masks
cannot trade them; only O1a shading can soften the read), nose-roll W3,
bow/rear wrap arc pairing, top rack-corner (builder-deferred, priced),
saucer +0.03 (r4 minor), close-crop mast Δtop columns (crop artifact
class), 0-paired-arcs as a number (chord-limit law honored — the CAST
READ orders above are shading orders, not silhouette orders).

## 5. Honest positives (carry forward)

Gate 91.2 re-verified on current bytes; parity rig clean ×2 rounds; dims
100; all five r4 order families delivered exactly in their windows —
this was a high-fidelity build round with zero found regressions; right
view is knocking on the tier door (8.5); §H.4 tells verified against
fresh sibling renders; machine checks all green; the r4→r5 trajectory
(5.0→7.0 floor, 6.4→7.5 mean) says one more disciplined round (O1 + the
chips) plausibly clears 9.0 — the remaining gap is concentrated in ONE
shading-class driver.

## 6. Evidence

- shots/critic-chieftain5/ (14 fresh pairs) + crops/ (zoom verifications)
- shots/visual-eval-chieftain5/ (report.json + annotated overlays)
- shots/critic-centurion5/ (fresh, §H.4 comparison)
- Tone rects measured on view-left/view-rear/view-rearleft/view-front/
  close-roof/hero-rearright as cited (ITU-601, tools/tmp-c5r5-tone.py)
- Machine: geometry-gate 91.2 PASS + standard-check FULL + track-clip 0/0
  (all re-run this round on HEAD f533a08)
