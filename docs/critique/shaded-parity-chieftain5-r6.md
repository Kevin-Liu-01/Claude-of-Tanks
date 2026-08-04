# chieftain5 shaded-parity r6 — independent critic, THIRD adjudication (2026-08-04)

Bytes: HEAD f296cc7 (the r6 landing), src/ clean, uk.js md5
05b025340f38497794109c63d06d4cdc (last touched by f296cc7 itself).
Machine gates re-run by me this round on those bytes:
- `node tools/geometry-gate.mjs --ids=chieftain5` ×2: **91.2 min PASS both,
  identical decimals** (hull 91.7 / whole 91.2 / **turret 94.1** / stations
  92.9 / dims 100 / floaters 100) — the r6 packet's turret 93.8→94.1 is real.
- `node tools/tank-standard-check.mjs`: FULL (clip 0/0 exact, contig 0,
  mg1+0d, gate age 0m).
- `node tools/track-clip-audit.mjs --exact`: front 0 / rear 0.
Official rigs fresh (my own runs, after the machine checks):
- `node tools/tmp-tank-critic.mjs --id=chieftain5` → shots/critic-chieftain5/
  (14 pairs, zero console errors).
- `node tools/visual-evaluator.mjs --id=chieftain5` →
  shots/visual-eval-chieftain5/ — **RIG PARITY OK: worst yawProxy 2.6°
  (rear), all others ≤1.0°; no RIG MISMATCH — scoring valid.**
Tone rects re-derived from MY renders (tools/tmp-c5r6crit-tone.py); zoom
verifications are crops OF the official renders only
(tools/tmp-c5r6crit-crop.py → shots/critic-chieftain5/crops-r6critic/).
Geometry freeze hash for the graduation commit: `tmp-hashgeo` **e8919e36**
(43 meshes, 101168 verts).

## HEADLINE: **GRADUATION PASS** — floor 9.0, mean 9.04; ALL 14 views at or above the 9.0 bar. §10 runs.

front 9.0 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.5 · frontright 9.0 · top 9.0 · hero-fl 9.0 ·
hero-rr 9.0 · hero-toptilt 9.0 · close-front 9.0 · close-roof 9.0

r4 floor 5.0 → r5 floor 7.0 → r6 floor 9.0. The r5 verdict said the gap was
concentrated in ONE cast-shading driver plus a polish family; the r6 builder
answered every order and my independent re-derivation confirms each one in
its r5 window. Every residual that remains is named below and is protected,
certified/priced, a documented coin, or sub-visible at 1x — none is
bar-holding. chieftain5 is the program's 18th graduate and the UK family's
first.

## 1. r5 order verification (all re-measured on MY fresh pairs)

- **O1 CAST-READ PASS — DELIVERED, silhouette-neutral (gate ×2 identical
  decimals proves no column moved).** (a) Cheek slabs → rolled facets:
  center panel + rotated cheek facets with crease beads read as distinct
  tone planes in frontleft/frontright/hero-fl/close-roof crops; the r5
  chin-plateau finding (frontleft 'proc 177.0 level vs ref 9.1 falling') is
  GONE from my digest; the cheek forward box dives to the nose. (b) The
  ordered driver kills verified: hero-rearright collar/cheek Δ+14.8 (r5)
  → the same anatomy now carries **matched Δ-1.8° ±0.2 over len 1.43 m**
  — dead; frontleft upper Δ-12.1 absent (worst remaining upper is a 0.25 m
  corner-band short). (c) Crown bin-fence: rim frames + dropped camo trays
  + dark moat plates verified in top/toptilt/close-roof — the saucer reads
  as a rounded mass against a shadow moat; the r5 'rectangle-city
  co-planar ring' read is broken. (d) L-union crests: tier + searchlight
  top-outer corners read rounded; radii authored + packet-cited
  (r 0.045-0.05 chord-limit class, not tool-paired — law honored).
- **O2 LEFT HEM PARITY — DELIVERED.** Left view shows six FULL wheel discs
  under a wheel-top hem like the ref's; the five 'dark teeth' gap tabs are
  DEAD (ground stubs now); opened gaps read as bay shadow. Gear-zone rect
  (700,345)..(1065,395) view-left re-derived: p5/mean/p95
  **25.8/52.7/63.6** vs ref 25.8/53.3/65.3 — packet-exact, parity held
  while the wheels gained full discs. Stations 92.9 unchanged (gate).
- **O3 TONE CHIPS — ALL DEAD (ITU-601 rects, my renders).** (a) Mauve
  ring: sleeve-root rect (880,300)..(930,340) close-front rgb (55,62,48),
  **g−r +6.7** vs ref-mirror +7.4 — green family, r≥g dead. (b) Wood
  lump: rear rect (745,335)..(763,350) **mean 62.2 / p95 63.4** rgb
  (64,63,55) (was L~135) — inside the ref's warm-accent band; the only
  warm content left on the rear half is 55 scattered flap-dust pixels
  L≤~84 (ref-true dirt class, symmetric, not a lump). (c) Under-collar
  band: front rect (925,225)..(995,250) p95 **71.1** mean 59.9 rgb
  (57,64,48) vs ref 68.1/54.9 — packet-exact, green-family; the r4
  tan-box family is closed. r4/r5 deliveries re-verified unchanged: rear
  corner columns 63.3 vs ref 63.5; rearleft sprocket-C p5 25.8 = ref 25.8.
- **O4 SLEEVE→EVAC THIRD FIT — DELIVERED; turret 94.1.** close-front
  sleeve→evac Δ-10.7 GONE from my digest (the view's worst is now the
  unrelated chin class, §4); top-view swell-step flag gone; left-view kink
  −11.3 → **Δ-8.7 ±0.8 len 1.05** = the documented SAG COIN (the fitted
  line integrates the 4.798..4.852 sag pocket that the ref carries only as
  an AA coin — exact columns and smooth render are mutually exclusive at
  mask resolution; columns delivered exact per packet, gate confirms).
  Certified/priced: binds this verdict, no order.
- **O5 (SHOULD) BUSTLE DUFFELS — DELIVERED.** Two duffel-class rolls +
  tray + end posts read in the basket mouth in rear/hero-rr/toptilt;
  silhouette byte-neutral (gate ×2, floaters 100). The r5 'flat empty
  plate' rear-bustle read is answered (residual: proc stowage reads
  neater/lower than the ref's warm heap — polish, §4).

## 2. Per-view scores (bar ≥9.0 every view; r5 line in parens)

| # | view | /10 | justification (rig numbers per §D, my run) |
|---|------|-----|--------------------------------------------|
| 1 | front (8.0) | 9.0 | 37 matched, 3 real flags, worst Δ+4.3° ±0.3 len 0.36; p95 Δtop/Δbot 0.104/0.088 m — razor. Under-collar band cured (71.1 vs 68.1); warm census 7 px (trivial); searchlight glint sanctioned. Cheek facets modulate the reclined face; collar + hood ring read round. Residual: proc face panel-busier than ref cast sweep; corner flaps dimmer-warm than ref's dusty flap tops — sub-visible at 1x. |
| 2 | frontleft (7.0) | 9.0 | 25 matched; the two large flags are the PROTECTED W1 wing-shelf 3D-form class (Δ+12.6 len 0.47, Δ-9.0 ±0.8 len 0.90 @ z 2.62 — mask-priced at the ref's own 1.34/1.249 cols); Δ-8.5 ±4 len 0.62 lower-right = bow-wrap/glacis-blend protected-column anatomy. All three r5 drivers cured: cheek faceted, hem/wheels full, tabs dead. Residuals: crown shorts Δ6.1/−4.5 (0.59 m) + a 0.25 m corner-band Δ-11.2 at the cheek top; Δtop p95 0.266 (crown boxes, improved from 0.289). |
| 3 | left (7.5) | 9.0 | 21 matched/7 flagged, worst = the O4 sag coin Δ-8.7 ±0.8 (certified, binds); p95 0.114/0.053 m. Full wheel discs under a wheel-top hem; gear rect parity EXACT (§1 O2). Bow-wrap arc unmatched = wing-tip dAlong protection honored. Remaining flags ≤5.4° shorts/rack-class (priced cols −1.75/−1.872). |
| 4 | rearleft (7.5) | 9.0 | 28 matched, worst Δ-8.7 ±4 len 0.34 (crown short, corner-bias band — same class r5 carried). Tabs-over-gear DEAD; sprocket-C p5 25.8 = ref; bustle now carries rounded stowage. Stern lower corner: mild −3.5 ±0.4 (0.71 m); ref rear-wrap arc unpaired = chord-limit law (shading orders only, honored). |
| 5 | rear (8.0) | 9.0 | 39 matched, 4 real flags, worst Δ+8.5 ±0.2 len 0.55 = bin-run top line (r5-unordered polish class, named residual). Corner columns 63.3 vs ref 63.5; chip DEAD; duffels read in the basket. Sub-0.25 corner flags ±9-12 are calibration no-findings. Residual: proc stowage neater/greener than ref's warm heap; stern face panel-busier — polish. |
| 6 | rearright (8.0) | 9.0 | 30 matched, worst Δ-12.3 ±4 len 0.29 tier-end — CERTIFIED bound (0.29 m, ±4 band, rolls there priced +0.05 on matched columns, packet-documented refusal); Δ+7.9 ±4 (0.30) same shoulder-transition family; Δ+7.5 ±0.6 (0.54) wing-shelf-class right side. Bins wall broken by trays/moats; wood chip dead; casting-shoulder roll holds (hull run at ref). |
| 7 | right (8.5) | 9.5 | 22 matched, worst Δ-4.3 ±0.8 (0.53) — cleanest view of the set; p95 0.151/0.046 m. Sleeve→tube step matches BOTH ref broken lines (held from r5, gate cols 1.736 = ref); mauve ring dead in this view too. Residual: flank bins slabbier than ref's smooth skirt at 2x — sub-visible at 1x. |
| 8 | frontright (7.5) | 9.0 | 25 matched; worst Δ+9.9 ±4 len 0.31 crown short + Δ-9.8 ±4 (0.27) right tier-end (corner-band family); far-side lower cluster Δ-6.4/+6.2/-5.3 = protected bow-wrap/wing-tip columns. Cheek facets + collar cone + smoke bank read; Δtop p95 0.289 = crown-box class (unchanged priced read). |
| 9 | top (7.5) | 9.0 | 19 matched; worst Δ-9.9 ±0.7 len 1.26 rack corner — BUILDER-DEFERRED PRICED (bound); fender fronts ±5.1/-5.8 (0.71) r5 class; muzzle smalls improved. p95 Δbot 0.376 → **0.304** (the −1.378 print is the tool's own 'cliff offset, not height error' note). Saucer front arc reads against the moat; trays organize the quilt. Residual: plan still quilt-vs-casting in character — ordered treatment delivered, remainder is priced mask-economy. |
| 10 | hero-frontleft (7.0) | 9.0 | 22 matched; worst Δ-12.0 ±4 len 0.34 upper-rear = the packet's DECLARED WATCH ITEM (rear-deck class) — reproduced exactly, stands as named residual. Crown centerline Δ-4.4 ±0.6 (1.00) mild. The r5 hero driver is gone: faceted cheek + brow bead + moated crown + full wheels + dusty gear band. Facet-vs-cast character difference remains at crease lines — the O1a-ordered pattern, delivered as ordered. |
| 11 | hero-rearright (7.5) | 9.0 | 24 matched; worst Δ+12.9 ±4 len 0.37 stern-low wrap/flap edge (track-region/tail class, priced family; shadow zone at 1x). Sub-0.25 prints (−14.4/12.6 @ 0.20-0.21) are calibration no-findings. The r5 Δ+14.8 collar/cheek edge is MATCHED (Δ-1.8 ±0.2 over 1.43 m); bins broken; chip dead; wheels/shoes dusted. Residual: duffels lower-profile than ref's heap. |
| 12 | hero-toptilt (7.0) | 9.0 | 18 matched; Δ+13.0 ±4 (0.27) stern-low + Δ-10.7 ±4 (0.28) shorts; Δ+8.5 ±0.5 len 1.17 right flank lip = skirt-hem/shelf priced family (side_hull tops at ref's own cols), reads straight at 1x. Crown: saucer + moat + stepped trays deliver the ordered read; MG present. Residual: tray quilt vs cast melt — same priced class as top. |
| 13 | close-front (7.0) | 9.0 | 22 matched; 3 of 4 r5 holds DEAD (sleeve kink GONE from digest; ring g−r +6.7; pale band 71.1). Worst Δ-9.1 ±0.7 len 0.61 = prow-underside rake (hull bow underside, r5's 44.7→36.0 class) — the ONE remaining above-noise unpriced item: shadow-zone under-surface, sub-visible at 1x (zoom-verified), flanked by protected wing-tip/W3 columns and the priced flap-bottom containment line; unordered by BOTH prior critics — polish class, named. Δtop p95 0.396 = close-crop mast back-projection class (r4/r5 treatment; ortho masts clean). |
| 14 | close-roof (7.5) | 9.0 | 30 matched; Δ-21.1 ±0.4 len 0.61 W3 nose-roll prints EXACTLY = PROOF the protected column is untouched (binds, no order since r4). MG READS GENUINELY: receiver mass + dark barrel crossing the pale deck (MG-physics polarity correct, zoom-verified). Ring band toned; trays + moat plates read. Residuals: facet-crease Δ-8.6 ±0.3 (0.49) at the cheek-top transition + sleeve-shoulder shorts (Δ11.0 ±4 @ 0.33) — the delivered facet language's own creases; cupola/MG zone Δ-5.6 (0.31). |

Floor 9.0 (thirteen views), 9.5 (right). Mean 9.04. **PASS.**

## 3. Standing checks (§B + §D + §H.4)

- **§B1 FRONT SLOPES: PASS.** Glacis rakes per print (close-front pair;
  worst glacis-junction flags ~4° on 0.46 m); reclined turret face
  reclines; belly V clean (front lower flags ≤4.3° short).
- **§B2 CONTIGUITY/HOLES: PASS.** Machine top-down hole scan 0 enclosed
  cells; my evaluator voids all re-verified as the r5-established classes:
  close-roof 1.609 m² = air between tube underside and deck (ref carries
  the same air), 0.006 m² under-sleeve pocket, hero-rr 0.007/0.003 m²
  track-region shadow pockets. No sky-through-hull in any of the 14 views
  (top + 55° tilt eyeballed).
- **§B3 DECORATION: PASS.** Census mg1+0d (hand-authored set carries the
  r4 packet justification; the r6 duffels are KIT tarpRoll class). MG read
  is now GENUINE at close-roof (receiver mass + barrel, correct dark-on-
  pale polarity); garage-distance read remains modest — inside the ≤0.4-pt
  pintle allowance as in r5.
- **§B4 TRACK CONTAINMENT: PASS.** Audit 0/0 exact; bow wrap clear under
  the wing shelves and stern wrap clear in the close/hero renders.
- **§D rig discipline:** gate ×2 identical decimals; both official rigs
  fresh on the landed bytes; parity clean (2.6° worst); every shape claim
  above cites evaluator numbers with printed noise bands; sub-0.25 m
  segments treated as ±4°-floor corner-bias per calibration; every tone
  claim is an ITU-601 rect re-derived from MY renders; the stale builder
  crops/ in the shots dir were NOT used as evidence.
- **§H.4 VARIANT-DISTINCTIVENESS: PASS, tells verified against fresh
  centurion5 pairs rendered this round (shots/critic-centurion5/).** At a
  glance: (1) mantletless conical collar vs centurion mantlet bulge; (2)
  L11 reach with sleeve step + extractor swell vs short 20-pdr/L7; (3) NBC
  pack + full-width rear basket WITH duffel rolls vs bare bustle; (4)
  fully-skirted terraced-bin flank vs exposed upper track run; (5) cupola
  + searchlight cheek cluster. The r6 additions (facets, moats, duffels)
  only widen the separation. Not remotely 'same tank re-badged'.

## 4. Residual ledger (all named; none bar-holding)

PROTECTED (bind, untouchable): close-roof W3 nose-roll Δ-21.1 (prints as
proof); wing-tip/bow-wrap + glacis-blend columns (frontleft −8.5-class,
frontright far-side cluster); W1 wing-shelf tops (Δ+12.6/-9.0/+7.5 3/4
blends); plan-turret −0.292/−0.3 marginals. CERTIFIED/PRICED (bind):
left/close-front sag coin (Δ-8.7 — the O4 exact-columns⇄AA-coin
exclusivity, documented); rearright tier-end Δ-12.3 + Δ+7.9 shoulder
family (±4 band, priced refusal); top rack-corner Δ-9.9 (builder-deferred);
bustle-rack/MG-receiver/tail gate classes (the gate top-14 is now entirely
pre-existing priced classes). NAMED POLISH (unpriced, none ordered — all
sub-visible at 1x): rear bin-run top Δ+8.5 (0.55 m); hero-fl upper-rear
Δ-12 ±4 (0.34 m, the packet's watch item); hero-rr stern-low Δ+12.9 ±4
(0.37 m); toptilt flank-lip Δ+8.5 (1.17 m, skirt-shelf family); close-front
prow-underside rake Δ-9.1 (0.61 m, shadow zone); close-roof facet creases
Δ-8.6 (0.49 m); duffels lower-profile than ref heap; plan quilt character;
corner-flap warmth dimmer than ref.

## 5. §10 graduation note for the orchestrator (registration facts CHECKED)

**Correction to the round brief: chieftain5 DOES have a MODEL_SOURCE
registration to retire.** `src/vehicles/userdrops5.js:152-155` (inside
`ALLOW_LOCAL_RECOVERED_MODELS`): `source('chieftain5', { turretNode:
'^Turret$', gunNode: '^Gun$', autoPivot: true, pitchOffset: -Math.PI/2 })`
— the local flavor ships the recovered GLB today (public already resolves
procedural). §10 step 1 applies in full: delete the source() call (leave a
graduate comment, m60a1/pt91m pattern); the GLB FILE stays on disk as the
measurement oracle. The `make('chieftain_mk10','chieftain5',...)` SPEC row
stays (specs ship everywhere).

Effective oracle config to mirror into ALL THREE override maps (§10
amendment; this is the exact config my passing renders used, source()'s
paintUntextured default expanded): `{ source:'glb', glb:{ path:
'/models/tanks/community/recovered/chieftain5.glb', paintUntextured:true,
turretNode:'^Turret$', gunNode:'^Gun$', autoPivot:true,
pitchOffset:-Math.PI/2 } }`
1. tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES,
2. tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES (local tmp),
3. tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES (committed —
   the §D evaluator ABORTS on graduates without it).
The maps inject full glb configs, so `pitchOffset` carries — it is the
Z-up→Y-up handling (authored Z-up OBJ heritage, vertex-extract REG carries
the same); WITHOUT it the ref loads on its back. LOAD-PROVE after
retirement: re-run tmp-tank-critic + visual-evaluator pairs and check the
RIG PARITY line (yaw-proxy ≤10°, no principal-axis break) before trusting
any post-graduation render — pt91m's -z-forward patch is the precedent
class.

Rest of §10: CUSTOM chip in the garage roster metadata; regenerate the 5
icons (§5.7 staging); record freeze hash **e8919e36** (43 meshes, 101168
verts) + graduation date in the packet; ledger row stays as the frozen
pass of record. Geometry is HASH-FROZEN from this verdict forward — any
geometry edit invalidates it (§G).

## 6. Evidence

- shots/critic-chieftain5/ (14 fresh pairs, 04:05 today, HEAD f296cc7)
- shots/critic-chieftain5/crops-r6critic/ (zoom crops OF those renders)
- shots/visual-eval-chieftain5/ (report.json + annotated overlays, this run)
- shots/critic-centurion5/ (fresh this round, §H.4)
- tools/tmp-c5r6crit-tone.py (ITU-601 rects), tools/tmp-c5r6crit-crop.py
- Machine: geometry-gate 91.2 PASS ×2 identical + standard-check FULL +
  track-clip 0/0 exact + tmp-hashgeo e8919e36 (all my runs, this round)
