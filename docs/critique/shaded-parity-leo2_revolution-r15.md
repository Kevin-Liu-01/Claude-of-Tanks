# leo2_revolution shaded-parity r15 — GRADUATION ADJUDICATION (round 5, 2026-08-05)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2_revolution` →
shots/critic-leo2_revolution/ (this session, zero console errors, favicon
404 only; vite 7468, FIFO lock free). Byte discipline: `tmp-hashgeo.mjs`
leo2_revolution = **7175fbf0** (79 meshes / **110905** verts = 110833 + 72,
exactly the two 36-vert trim slabs of the 717f9c8 landing) verified BEFORE
rendering and re-verified AFTER all evidence runs (bookend clean;
leopard.js + docs/geometry-gate/leo2_revolution.json working-tree clean at
717f9c8 throughout — my gate runs reproduced the committed landing JSON
byte-for-byte). Graduates frozen both bookends: leo2a5 **bc9bad30**,
leo2a6 **80b76338**, kf51 **3ae9b70c** — the standing freeze lines.
Official gate re-run by me: **min 90.7 PASS ×2 BIT-IDENTICAL** (hull 90.8 /
whole 90.7 / turret 92.1 / stations 91.4 / dims 99.5 / floaters 100 —
cmp-clean between runs; exactly the 717f9c8 landing line; hull −0.4 /
whole −0.1 vs r14 = the priced ramp-window trade, every component ≥90,
dims 99.5 EXACT = idler untouched, the dims-guard held).
`visual-evaluator.mjs`: exit 0, **RIG PARITY OK** (max yawProxy 1.2°
@close-front — the packet's own digit, registration proxy moved with the
front-low mask, <10 gate; every other view ≤0.8°), evidence at
shots/visual-eval-leo2_revolution/ (my run). standard-check exit 0:
gateMin 90.7 | clip **0/0 ✓** | contig 0 ✓ | decor mg1+4d ✓. Standalone
`track-clip-audit --exact`: front **0** rear **0** ×2. Source audit: the
717f9c8 diff is confined to the documented lane — leoGear contactZF/
contactZR opt-in pass-through (siblings undefined-inert, PROVEN by the
frozen graduate hashes both bookends), revolution contactZF 2.22, one
raked-bottom trim plank per side in the r13 leoGearTrimL/R buckets.
Measurements: tools/tmp-rev-critic-r9-measure.py (standing §D refined
mask: maxch ≤13 AND B−R ≥ +8) + tmp-rev-r13-chainflag.py on a FRESH
self-generated tmp-e3-maskprobe dump (border-clip law) +
tmp-rev-critic-strips.py (§H.4) + tmp-rev-r15-crop.py magnified windows.
Crops under shots/critic-leo2_revolution/crops/ are DIAGNOSIS-ONLY.

## HEADLINE: GRADUATION PASS — ALL FOURTEEN VIEWS AT 9.0. The R5-1 done-gate is met on my rig to the digit: the hero-fl ramp pair reads **Δ+3.3 ±0.2 INSIDE the ±5° gate** (ref 19.4° / proc 22.7°, len 0.92 m, low zone), a SECOND low pair the r14 rig could not even match now matches at **Δ−0.7** (ref 22.1°/proc 21.4°), the hem-oblique secondary is REDUCED to +5.6, and at 1× and 3× the arch-to-beak lower silhouette reads as ONE shallow diagonal — the ref's approach-ramp class, no serrated rise, §B1-lawful. Every gate, flood, tone and audit digit re-derives EXACTLY at the r14/r15 packet values inside a bit-identical 90.7 gate at hash 7175fbf0. The r14 verdict's single order is delivered; no residual anywhere dominates a 1× read and every one carries a certified owner. Dual gate met — this tank is the program's 22nd graduate on my recommendation.

front 9.0 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.0 · frontright 9.0 · top 9.0 · **hero-fl 9.0** ·
hero-rr 9.0 · toptilt 9.0 · close-front 9.0 · close-roof 9.0

Ladder: r7 6.6 floor → r9 7.7 → r13 8.1 → r14 8.8 → **r15 9.0 CLEAN**.

## Claims audit (§D — every r15 packet done-gate re-derived on MY rig)

- Gate 90.7 ×2 bit-identical, components to the decimal: **CONFIRMED**
  (and my runs byte-match the committed landing JSON — tree stayed clean).
- Hash 3820620 → 7175fbf0 (79 meshes unchanged, verts 110833 → 110905 =
  +72 = two 36-vert slabs): **CONFIRMED** both bookends.
- Evaluator parity 1.2° @close-front, no RIG MISMATCH: **CONFIRMED**
  (exit 0).
- **R5-1 RAMP DONE-GATE to the digit**: hero-fl low-zone matched pair
  **ref 19.395° / proc 22.679°, Δ+3.284 ±0.247, len 0.92 m @world
  (1.03, 0.05, 2.62)** — INSIDE ±5°, was Δ+13.2 at r14. BEYOND the
  claim: a second low pair **ref 22.1° / proc 21.4°, Δ−0.7 (len 0.48
  @z 2.02)** — the exact ref edge try-1 left UNMATCHED — now matches,
  and lower-front 44.8/46.0 reads Δ+1.2. The ref's residual lower
  sub-chords sit at the packet's named digits (22.4°/0.47 m,
  15.5°/0.67 m unmatched) and the r2.43 span-97° wheel/ramp arc remains
  refOnly — the re-certified straight-tangent-vs-arc print identity per
  the r14 disposition's own clause.
- **Hem-oblique REDUCED**: hero-fl secondary pair 43.1/48.7 = **Δ+5.6
  ±0.8** (was +9.2 family); frontleft worst now **+9.1** (was +9.2).
- **RAMP OFF THE (WORST-)FLAG BOARD**: hero-fl worst flag is **+10.9**
  = the certified jacket-corner class, NOT the gear zone — packet digit
  exact. Every one of the 14 evaluator worst flags matches the r15
  packet to the decimal (front −2.5, fl +9.1, left +12.8, rl −10.6,
  rear −9.8, rr −10.4, right −9.2, fr −11.2, top +14.5 ±4, hero-fl
  +10.9, hero-rr −7.1, toptilt +13.8 ±4, close-front −10.5, close-roof
  −9.2).
- **close-front ramp window IMPROVED**: the r14 ref-only 31.2° ramp
  diagonal now MATCHES at **Δ−1.6** (proc 29.6, len 0.74); the 31.8°
  window reads +7.0 (proc 38.8 @z 2.84, frame-bottom oblique) — the
  same §B6 straight-vs-arc identity, smaller than the r14 carry.
  frontleft's ramp-zone pair reads Δ−3.7 INSIDE its ±4 band.
- **§B2 flood ALL TEN VIEWS to the pixel** (refined mask, PROC halves):
  front 92, rear **99**, rearleft 92, rearright 92, frontleft 92,
  frontright 92, left **120**, right **126**, top **110**, toptilt
  **94** — EXACTLY the r15 packet digits (base ≈92 px = label glyphs
  y13..21 x16..104; toptilt prints the bare 94 = the packet's own note
  on the r14 95). ZERO movement from the trim planks.
- **Tone certs at the landing bytes**: B1 left strip [120:500]×[372:392]
  med **56.9** p5 **51.4** (gates med 48..58 / p5 ≥40; the plank's
  in-rect pixels moved med 56.6→56.9 exactly as documented, 1.1 luma
  headroom to the 58 ceiling — R5-2's skip is justified by my own
  digits); right med **51.7** p5 **45.3**. D1 tail [190:447]×[338:372]
  med **77.3** p95 89.6 **sd 12.31** (the r12–r15 digits EXACTLY).
  F1 jacket [120:500]×[305:355] proc med **67.4** vs ref same-rect
  **67.4** — **Δ0.0**.
- **HERO-VOID RE-DERIVED ON A FRESH MASK** (my own tmp-e3-maskprobe run
  at today's bytes + chainflag): **enclosed regions = 0**; the proc body
  EXITS the 1024-frame border (right edge, rows y 524..661, **138**
  border px — the r14 digits exactly). The evaluator's hero-rr 0.739 m²
  @(−2.34, 1.98, −1.01) is the certified border-clip artifact. And on
  the critic pair itself the hero-rr PROC flood = 92 px label glyphs
  ONLY. Remaining evaluator voids at certified digits: toptilt 3.386 m²
  (projection bay) + 0.294 (sprocket), top 0.002 sliver, close-roof
  0.003 (below).
- **close-roof pocket (the round's one NEW declared carry)**: +1
  enclosed pocket **28 px @y519..527 x133..138** — EXACT packet
  coordinates (the arch/hem corridor the flatten opened). On MY mask
  the ref's OWN close-roof half carries **~363 px of same-class
  enclosed pockets across six+ blobs** (121/80/64/41/29/24 px — the
  packet counted 289 px; my mask reads more, the direction is the
  same and the discrepancy is method variance, not load-bearing): the
  proc deck is an order of magnitude CLEANER than the print's own.
  §B2 ten-view gate untouched (digits above).
- **§B5 stranded 6 / abutting 0 / dangling 0**: CONFIRMED, boxes
  decompose EXACTLY into the r13/r14 adjudicated classes — driver
  periscopes (−0.68..−0.29 × 2.00..2.03 × 1.72..1.85 to the
  centimetre), merged hull (±1.42, overlap 0.5), merged hullDark
  whole-bucket (±2.00, overlap 0.26), three deck tint plates
  (y 2.01..2.11). PASS (adjudicated false-positive classes).
- **Upper-rear −12.0 ±4 matcher-assignment artifact**: present on my
  rig (ref 21.3/proc 9.3, len 0.26 m @(−1.44, 2.88, −1.04)). I audited
  the landing diff: rear-deck code is UNTOUCHED — the pair is a
  short-segment corner-bias-tier chip (±4° floor band) whose pairing
  shifted when the front-low edge set changed. Adjudicated as claimed;
  invisible at 1× (0.26 m upper-deck chip).

## §B standing checks

- **§B1 FRONT SLOPES + NO-STAIRCASES — PASS at 1× and magnification**
  (crops r15-herofl-ramp-3x, r15-herofl-gearlow-3x,
  r15-left-frontramp-4x, r15-left-rearramp-4x): bow wedge reads as ONE
  raked surface; the NEW trim-plank line runs CO-LINEAR with hem facet
  A — the arch-to-beak lower silhouette is ONE shallow diagonal on both
  the hero and the side cameras, no stacked-course serration anywhere I
  magnified. The r14 kill (bow strata, cheek verticality, hem
  staircase) HOLDS: front worst flag −2.5°, the cleanest sheet on
  record for this tank.
- **§B2 — PASS**: ten-view digits above, zero movement; residuals are
  label glyphs + the certified left/right/toptilt hairline classes.
- **§B3 — PASS**: census mg1+4d; RWS parses (tub + optic + pedestal),
  MAG pale top cover reads from the ordered close-roof window.
- **§B4 — PASS**: 0/0 --exact ×2 + standard-check; the moved wrap-arc
  end (138.6°→147.7°) shows ZERO containment cost on my independent
  audit; close-front shows wrap + plank step + track visible under the
  beak, rear corridor shows track + wheels at 4×.
- **§B5 — PASS** (boxes verified above; yaw-90 rotating-furniture pair
  unchanged this campaign — no turret-furniture geometry moved at r15,
  gate row equality ×2 is the proof).
- **§B6 — PASS, THE FIXED READ VERIFIED**: trapezoid \\________/ both
  sides at 4× — ground run 2.22..−2.1775 is the SHORT base, BOTH end
  wheels raised, tangent ramps at both ends (rear untouched at the kit
  default; ref rear 35.1° vs proc 34.6°). The approach tangent now
  lifts INSIDE the ref's own angle class (side whole-rise proc 35.2 vs
  ref 36.3 per the packet's side probe; my hero instrument Δ+3.3): the
  r14 floor holder is DEAD as an order and survives only as the
  re-certified arc-blend print identity.

## §H.4 VARIANT VARIETY (three graduates, fresh strips
shots/critic-leo2_revolution/crops/h4r15-rev-vs-{a5,a6,kf51}.png)

- vs **leo2a5 (bc9bad30)**: PASS — a5: scalloped skirts + exposed
  seven-wheel row, mantlet dead-front, lower-wall cable-X + Y-508 +
  twin shackle discs; rev: closed AMAP jacket cliffs + hub-dot band,
  corner lattice cards, pale lattice tail band with the X ON it, RWS
  tub deck.
- vs **leo2a6 (80b76338)**: PASS — a6: exposed wheel row, proud blister
  + L/55 mid-step, louvre grille + V splash board at the tail; rev as
  above.
- vs **kf51 (3ae9b70c)**: PASS — different silhouette family entirely
  (hex-arch skirts, muzzle brake, SEOSS tower, black ERA pads).
- Every tell is geometric and held byte-frozen (hashes ×2 both
  bookends).

## Per-view justifications (bar ≥9.0; r14 score in parens)

Calibration: pt91m-r28/merkava3d-r13 graduation practice — a view rides
at 9.0 carrying NAMED residuals when every one has a certified owner
and none dominates the 1× read.

- **front 9.0** (9.0): worst flag −2.5° (record sheet); RWS + MAG cover
  + B1 towers + corner cards + D3 slit all read. Carries: pod-zone
  richness, right-grid width (§C-priced), print microlines — unchanged
  digits, none bar-holding.
- **frontleft 9.0** (9.0): bow wedge ONE surface (shelf pair +5.7 ±0.5
  EXACT r14 digit); hem oblique **+9.1** (IMPROVED from +9.2, mudflap-
  curtain class, merkava3d-precedent compatible); ramp zone Δ−3.7
  inside noise; +6.6 jacket seam carry; turret-front volume
  (dims-pinned r7 class).
- **left 9.0** (9.0): B1 strip 56.9/51.4 inside gates; seven hub discs
  read in the band; F1 jacket Δ0.0; trapezoid + co-linear trim verified
  at 4×; carries at digits (+12.8 ±4 short vertical, no-evacuator,
  fore-roof twin, bustle-corner arc).
- **rearleft 9.0** (9.0): containment clean at 4×; worst −10.6 (r14
  class family); hem twin, quarter-yaw projection profile — certified
  carries, none dominating.
- **rear 9.0** (9.0): flood 99; D1 cert 77.3/12.31 EXACT under the
  cable-X on the lattice band; clusters/shackles/flaps read; turret-
  rear variant furniture = §H.4 tell, carried.
- **rearright 9.0** (9.0): mirror; corner lattice edge-on; sprocket
  containment clean; −10.4 course-lip class at digit.
- **right 9.0** (9.0): B1 strip 51.7/45.3; hub row reads; −9.2 worst =
  whip-stub bistability family; departure-ramp shadow refOnly (gear
  class) carried.
- **frontright 9.0** (9.0): mirror; −11.2 law-5 matching drift at the
  mantlet break (r14 −11.4, column-pinned class); idler-arc-behind-
  skirt gear-visibility carry.
- **top 9.0** (9.0): flood 110; toe pair still dead; +14.5 ±4
  wrap-outline projection (§B4 open-wrap corner class); fan r 0.36
  deck-carry; plan width 2.00 dims-sovereign; 0.002 sliver only.
- **hero-frontleft 9.0 (8.8 — THE DELIVERED ORDER)**: the R5-1
  done-gate is met on my instruments (Δ+3.3 ±0.2 main pair, Δ−0.7
  second pair, both INSIDE the gate; hem secondary +5.6 REDUCED) and
  on my eyes at 1× and 3×: the lower band reads the ref's long-shallow
  approach class — one diagonal from arch to beak, track visible under
  the jacket, no serrated rise. The remaining worst flags are the
  certified jacket-corner trio (+10.9/+10.1/+9.8 width/crown
  perspective mixes), −8.7 upper-rear, and the −12 ±4 matcher chip —
  all upper-band, all owned, none dominating. The arch-prominence
  residual (ref's exposed idler/arch vs our closed-jacket kit read +
  r2.43 arc-blend) is the re-certified print identity per the r14
  disposition clause — at this magnification it no longer carries the
  view below the bar. 9.0, earned.
- **hero-rearright 9.0** (9.0): border-clip artifact re-proven on a
  fresh self-generated mask (0 enclosed regions, 138 border px); PROC
  critic-half flood = labels only; X + lattice + clusters +
  containment; worst −7.1.
- **hero-toptilt 9.0** (9.0): chorded fans, cable line, organics, tint
  plates; 3.386 + 0.294 certified digits; +13.8 ±4 wing-pull
  gate-priced class.
- **close-front 9.0** (9.0): bow ONE raked wedge + rooted clamp + hem
  meeting the beak co-planar; the 31.2° ramp diagonal now MATCHED at
  −1.6; ramp window +7.0 (improved §B6 identity carry); −10.5 RWS/pod
  parked digit (stable four rounds); containment reads.
- **close-roof 9.0** (9.0): fore-roof ONE raked plane (−9.2 EXACT law-5
  digit); RWS full parse + MAG pale cover; the NEW 28 px pocket is
  sub-visible at 1× and an order of magnitude inside the ref's own
  same-class pocket census (~363 px); whip-stub bistability + print-
  grain extreme-zoom carries.

## Residuals carried into graduation (all owners named, all certified)

- §B6 arc-blend print identity: ref r2.43 span-97° arc + lower
  sub-chords 22.4°/0.47, 15.5°/0.67 unmatched (straight tangent + trim
  line vs print arc; main chord MATCHES at +3.3) — RE-CERTIFIED per the
  r14 disposition clause; close-front +7.0 window same owner.
- hem oblique +9.1/+5.6 family — ref mudflap-curtain, merkava3d
  precedent.
- jacket-corner +10.9/+10.1/+9.8 trio, upper-rear −8.7, −12 ±4 matcher
  chip (rear-deck bytes untouched — audited), fore-roof law-5 drifts
  −9.2/−11.2, RWS/pod −10.5, top +14.5 ±4 / toptilt +13.8 ±4 / left
  +12.8 ±4 projection classes, no-evacuator, plan width 2.00
  (dims-sovereign), whip-stub bistability, muzzle cover 0.56, border-
  clip 0.739 chain, close-roof 28 px pocket, B1 rim-contrast tone cap
  (1.1 luma headroom, R5-2 measured unnecessary — my digits concur).
- B1 idler dims-guard: the ref's last ramp columns stay uncovered by
  design (dims 99.5 sovereign) — priced since r7, unchanged.

## VERDICT — GRADUATION PASS (the program's 22nd graduate)

Dual gate MET at hash **7175fbf0**, commit 717f9c8: geometry min
**90.7 PASS ×2 bit-identical** (every component ≥90, dims 99.5, gate
JSON byte-matching the landing) + independent critic **9.0 EVERY VIEW,
×14** on fresh same-session renders, same vehicle, same tier. The
five-round arc closed exactly as projected: r14 killed the four parked
geometry classes, r15 delivered the last order — the §B6 kit
approach-ramp — to the done-gate digit with a mechanism now banked as
fleet law (contact-pin visibility bound + trim-strips-pair-with-kit-
pins). Zero regressions anywhere I measured: floods to the pixel, tone
certs to the second decimal, audits 0/0 ×2, graduates byte-frozen.

RECOMMENDATION: proceed to GEOMETRY-GATE.md §10 — retire the
registration into the THREE override maps (procedural-fidelity.html
LOCAL_REFERENCE_OVERRIDES + tmp-tank-critic.html and
visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES), freeze
leo2_revolution at **7175fbf0** on the graduate hash line, and land the
graduation commit. Orchestrator lane — this verdict file is my only
write. Post-freeze, any future ramp/kit work on the leopard family must
treat the revolution's contactZF=2.22 + leoGearTrimL/R planks as
graduate-frozen bytes (§H.3 migration rule applies).
