# centurion5 shaded-parity r7 — independent critic, SECOND adjudication (2026-08-05)

Adjudicates the combined uk tone round (9062a07) against the r6 verdict
(f04beee, FAIL floor 5.5 mean 6.3) under the ratified calibration ruling
(chieftain5 r4 anchor governs severity: wall-hides-gear = 5.0 → orders →
graduate; ladder 5.0 → 7.0 → 9.0).

Bytes and rig integrity, verified by me this round:
- `tmp-hashgeo` centurion5 = **2395a924** (48 meshes / 73004 verts) at
  campaign START and END — no drift. Family watch: centurion3 **ac63e6d8**,
  chieftain5 graduate **5117b9a8** — both EXACT, byte-frozen through the
  tone round as the packet claims.
- `node tools/geometry-gate.mjs --ids=centurion5` **×2: min 90.5 PASS
  both, identical lines** (hull 92.6 / whole 90.7 / turret 90.5 /
  stations 95.5 / dims 100 / floaters 100) — the tone round held the
  a20e801 floor to the decimal. Priced headroom: **turret 0.5, whole
  0.7, hull 2.6** (unchanged — nothing was spent).
- `tank-standard-check`: PASS (clip 0/20 ✓ documented class, contig 0 ✓,
  mg1+0d ✓). `track-clip-audit --exact`: 0 front / 20 rear (the r6
  sprocket-grazes-tail-loft cert, kv2 band ≤60). `turret-parent-audit`:
  0/0/0.

Official rigs, fresh this round (FIFO honest; queue was empty at 14:20,
my c5 render + evaluator + c3 sibling board ran back-to-back):
- `node tools/tmp-tank-critic.mjs --id=centurion5` → shots/critic-centurion5/
  (14 pairs, zero console errors). Sibling board re-rendered fresh at the
  post-tone bytes: shots/critic-centurion3/ (ac63e6d8 carries c3's own
  tone work — the Aug-5-10:20 board predated it).
- `node tools/visual-evaluator.mjs --id=centurion5` →
  shots/visual-eval-centurion5/ (report.json + overlays, camoSeed 4242).
  **RIG PARITY OK — no RIG MISMATCH: max yawProxy 1.4° (close-front),
  all orthos ≤0.3°; frameOffset (0, 0.023, 1.205) is registration
  data.** Scoring valid.
- Tone/sky numbers: `tools/tmp-cent5r7-tone.py` (r6 verdict rects
  re-measured on MY renders + the new classes; ITU-601 rects; sky =
  mask-method + blue-signature). Zoom crops diagnosis-only.

## HEADLINE: **FAIL vs the 9.0 bar — floor 7.0, mean 7.25. Ladder: 5.5 → 7.0 floors (+1.5), 6.3 → 7.25 mean. ALL SIX r6 ORDERS VERIFIED DELIVERED; the residual is one geometry campaign (O3, the banked cast-turret read) plus a polish family.**

front 7.5 · frontleft 7.0 · left 7.5 · rearleft 7.0 · rear 7.5 ·
rearright 7.0 · right 7.5 · frontright 7.0 · top 7.5 · hero-fl 7.0 ·
hero-rr 7.5 · hero-toptilt 7.0 · close-front 7.5 · close-roof 7.0

This is the chieftain5-r5 stage of the ratified ladder, almost exactly:
identity failure dead, machine gates green, the distance to 9.0
concentrated in the cast-turret slab grammar (§B1, banked last round
with 0.5 turret headroom) plus cheap material polish. The builder's
floors-~+2 self-read was honest.

## r6 order verification (each re-measured on MY fresh pairs)

- **O1 EXPOSE THE GEAR — DELIVERED.** The 5.5-floor setter is dead: hem
  raised to 0.84 on panels 0–4 both sides, six wheels read with correct
  count and rhythm. Band rect (700,340)..(1100,400) luma mean 56.1 sd
  11.6 vs ref (60,340)..(460,400) 51.3 sd 9.2 — in-family (+4.8).
  Honest residual: the DISC FACES read pale and flat — one-disc
  interior (802,374)..(858,402) mean 64.5 p95 73.2 vs the ref disc
  (247,341)..(293,387) 51.4 p95 55.9 (+13 luma), and no rim/tire ring
  or hub circle reads at 1× where the ref shows both (the builder's own
  banked crop shots/uk-tone-combined/c5-gear-after.png shows the same
  contrast). New order O7.
- **O2 TRACK/WRAP TONE — DELIVERED.** Horn/pad row (720,378)..(1080,396)
  p5 25.8 mean 61.3 (r6: p5 6.8, near-black) vs ref run 49.8; ground
  strip 45.8 vs ref 40.0; front wrap faces (733,345)..(822,470) mean
  52.8 = ref band 52.8 EXACT, sky 0/11125 + 0/11250 (maxch-only 32/50 =
  warm shadow, correctly rejected by blue-signature). The black-band,
  teeth-on-pale-disc and pale-ground-strip classes are all dead — the
  close-front idler now reads as a lightening-holed disc inside an
  olive wrap. Residual: the proc row sits ~+11 over the ref run (lit
  lower wheel arcs dominate) — in-family, no order.
- **O4 OFF-PALETTE — DELIVERED.** Ex-tan hood rect (985,235)..(1030,290)
  now 54.4 / p95 72.4 rgb (54,57,43) vs target ≤73 and ref hood (56,62,47)
  — the feature kept, the pop dead. Ex-blue chips: (900,141)..(928,155)
  rgb (66,73,60) r−g −7 and (1018,156)..(1031,172) r−g −5 — the BLUE
  class is dead; they now read as pale-olive lids +23..28 over the 41.4
  deck context (minor polish, O10c). Muzzle face 60.8 vs ref 57.9 with
  the bore disc seated (r6: 63.3) — honest.
- **O5 REAR DRESSING — DELIVERED.** Tow cable drapes the tail plate in
  the ref's double-U with end cleats + spare-link plates at the
  shoulders; the empty-plate read is gone (tail zone 48.1 vs ref 59.0,
  composition present). Flank basket walls no longer pale slabs —
  but the rebucket overshot the ref: panels 53.8 vs ref 65.2 (the ref
  weave reads LIGHTER than its casting, dotted). Small order O9.
- **O6a M2 RE-POSE — PARTIAL.** The rotation-only re-pose reads: the
  barrel line crosses the pale bustle dip in rear/toptilt views and the
  receiver+ammo-can mass exists at 4×. But at close-roof the receiver
  zone (1078,226)..(1120,244) measures 44.2 vs crown behind 44.4 —
  ZERO tone contrast; MG PHYSICS dark-crown polarity does not read at
  the view that showcases the roof. SHOULD carried (O10a).
- **O6b DRUM TELL — DELIVERED.** The evacuator body reads as a fat
  warm-gray band: close-roof rect (735,378)..(800,402) rgb (54,51,43)
  r−g +3 vs tube fwd (48,52,39) r−g −4; right-view band (808,283)..
  (852,302) r−g +0.8 vs tube −6.0. The ref keeps its drum scheme-tone
  (47,52,41 vs tube 50,53,42) and reads by geometry alone — the proc's
  tone split is doing legitimate §H.4 work at garage distance. Warmth
  is sub-threshold everywhere (warm-family audit r−g≥+8: 0–5 px per
  view, ref halves 0–4 — statistically identical). Optional neutral
  nudge O10d.

## Per-view scores (bar ≥9.0 every view; §D numbers cited)

| # | view | /10 | justification |
|---|------|-----|----------------|
| 1 | front | 7.5 | Wrap faces at exact ref parity (52.8 = 52.8, sky 0 both); hood/chip/muzzle classes dead. 26 matched edges (1 flagged, worst Δ−5.4°). Holds below tier: ref-only cupola dome arc 104° r0.102 @ (−0.82, 2.81, −0.11) — the 3-ring stack answers a dome (O3c); discharger bins + cheek ammo stacks read as bare cuboids beside the gun root (§B3, O8); crown tabs behind the cheek rake. Pale lid pair +23..28 over deck 41.4 (O10c). |
| 2 | frontleft | 7.0 | Gear zone transformed (blob rhythm reads, wrap olive); crown-tab flag REAL at Δ−14.5° ±4.0 len 0.27 m @ (0.14, 2.54, 1.26) + cheek rake dead-ending into the vertical wall (O3a/b); both wrap arcs unmatched (116° sprocket @ (−2.76,0.95,−2.72), 102° idler @ (1.71,0.86,1.76)) — serrated proc wrap edge defeats the circle fit (O10b); bay-window rectangles + pale disc faces in the opened band (O7; strip tone itself measures ref-parity: 55.1 sd 5.4 vs ref 55.8 sd 5.4). |
| 3 | left | 7.5 | The r6 floor, cured: six discs read at correct pitch under the 0.84 hem; band tone in-family (56.1 vs 51.3); profile p95 Δtop 0.105 / Δbot 0.080 m; zero required arcs in this view. Remaining: disc faces +13 luma flat-pale with no rim/hub read (O7 — the Horstmann identity is present but toy-grade); ramp lines still refOnly (28.1°/154.7° len ~1.15 m @ z +1.93/−4.00 — horn-tip serration breaks the line fit, shape itself honest §B6); 20 refOnly edges are the inter-wheel verticals y 0.19–0.48 the flat proc faces do not produce. |
| 4 | rearleft | 7.0 | Rear wrap "C" cured (olive sprocket disc, no black teeth); tail cable reads. Serrated run-edge flag Δ−12.7° ±0.7 len 0.87 m @ (2.62, 0.10, −1.52) persists (O10b); idler wrap arc 90° unmatched; crown tab Δ+11.7 @ (−0.89, 2.16, 2.15); basket panels dark-overshot (O9). |
| 5 | rear | 7.5 | The r6 blockers all cured: cable double-U + cleats + shoulder links delivered, wrap corners olive with slats reading, sky 0 real (the 5.35% rect hit re-located to x 711–721 = background outside the ragged silhouette edge — rect overhang, not holes; corner crop verified solid). Holds below tier: bustle rear reads square rectangle-in-rectangle vs the ref casting (O3d; ref casting-shoulder arc 81° r0.142 @ (−1.1, 2.33) unmatched); panels 53.8 vs ref 65.2 (O9). |
| 6 | rearright | 7.0 | Mirror of rearleft (Δ+13.5° flag; wrap arcs 93°/140° unmatched; O3d corners; O9 panels). Drum band visible from the quarter — the Mk.5/2 tell working. |
| 7 | right | 7.5 | Mirror of left (disc faces O7, ramp lines 26.2°/152.0°). The Mk.5 flank basket no longer a pale slab; ref-only 154° r0.269 bustle-rear arc @ (−0.05, 2.46, −2.22) = the O3d rounding the proc answers with straight rails. |
| 8 | frontright | 7.0 | Crown-tab flag REAL at Δ+14.3° ±0.8 len 0.34 m @ (0.60, 2.83, 0.50); sprocket wrap arc 139° unmatched; discharger bin cuboid at the near cheek (§B3); otherwise the frontleft read mirrored. |
| 9 | top | 7.5 | Track strips cured (rear quarters 51.7/52.0 vs ref 46.6 — the black-with-pale-dashes class dead); plan hood pop dead. Holds: the roof still tiles as rectangles (crown ridge + step tabs + bustle rails as straight pale edges vs the ref's one organic casting — O3b); procOnly 26 panel-line clutter; bow-corner flags (Δ−11.8/+9.9 ±4.0, len 0.29 corner-bias family, above band but small). Profile p95 Δtop 0.073 m — tightest of the round again. |
| 10 | hero-frontleft | 7.0 | The garage hero: stance, tube, drum band and exposed gear now genuinely read Centurion. Broken by the discharger-bin cuboid standing at the cheek beside the gun (§B3 at hero range), crown slab stack + cheek-wall corner (Δ+10.7 flag family), pale disc faces, idler arc 128° unmatched. |
| 11 | hero-rearright | 7.5 | Best 3/4 again: tail composition complete (cable, links, stubs, courses), drum tell visible, gear band honest. Casting-shoulder arc 165° r0.132 @ (1.76, 2.60, 2.26) + hull arc 85° unmatched; bustle corners hard-boxed (O3d); 1/1 borderClips honored (no order — hero-void law). |
| 12 | hero-toptilt | 7.0 | Rectangle-city crown persists from tilt (Δ−12.1° ±0.6 len 0.37 m @ (−1.01, 2.59, 2.62) crown-front class — O3b); bow track segments cured (toned); M2 reads as a line crossing the bustle dip (better, still thin — O10a). Warm-strip eyeball reads (baskets/links/log) all measure IN-FAMILY (r−g −1..−3 vs ref −2; warm-audit 3 px vs ref 4) — no order, numbers override eyeball per §D. |
| 13 | close-front | 7.5 | The bow test transformed: near wrap olive with the idler's lightening holes reading, far wrap olive, hood dark-olive keeping its drape, muzzle + bore disc honest at the exact tip plane. Holds: the twin discharger bins read as bare dark slabs AT THE GUN ROOT at this range — §B3's own named zone (the ref shows the housing + scalloped tube-mouth row; the proc's three 2px tube bumps vanish at 1×) — O8; cheek-wall hard corner (O3a); falling horn-tip courses read slightly choppy (minor, cert class). |
| 14 | close-roof | 7.0 | Crown furniture stations verified again (cupola −0.48/−0.15, sight 2.545, vane p95 anchor — dims-sovereign certs respected). Drum tell reads clean. Holds: the slab-stack crown + 3-ring cupola dominate the closest view (O3b/c); M2 receiver 44.2 vs crown 44.4 = tone-invisible (O10a); pale lids +14..19 over local context (O10c); under-tube void rect 0/2800 sky (1355 maxch-only = warm shadow — the r6 adjudication stands, no §B2 order). |

Mean 7.25; floor 7.0 (seven views). FAIL vs the every-view-9.0 bar.

## Standing checks (§B + §D + §H.4)

- **§B1 slopes + NO-STAIRCASES + SLOPE-MOTIVATES-THE-MASS: hull PASS /
  turret FAIL (unchanged, banked).** Glacis one-rake + single-plane
  driver step hold under fresh renders; tail shelf courses read as
  authored plates. The turret remains the appliqué-slope-over-box class
  the law names: cheek rake dead-ends into vertical flank walls, crown
  ridge/tabs stack behind the rake (the ±14° flag family at (0.14–0.77,
  2.5–2.98) reproduced this round to the coordinate), cupola answers a
  104° dome arc with 3 stacked rings. No turret geometry landed this
  round (correctly — 0.5 headroom mid-critic); O3 is now THE order.
- **§B2 contiguity/holes: PASS.** Machine contig 0; every dark-zone and
  void rect re-measured 0 sky px under mask+blue; the one 5.35% rect hit
  adjudicated as rect-overhang background (cluster confined to x 711–721,
  uniformly spread y 290–429 = outside the silhouette; 4× corner crop
  solid). The revolution-r7 inflation class correctly avoided in both
  directions.
- **§B3 decoration: census PASS, NO-MYSTERY-BOXES FAIL (new law,
  ff50bf5 — post-dates r6).** mg1 KIT fitting + cables, cleats, log,
  baskets, links, dischargers. Under the new standing check the twin
  discharger BINS at each cheek are bare cuboids beside the gun root —
  "a launcher has tubes" is the law's own tell, and the ref print
  presents exactly that (housing + scalloped mouth row). The cheek
  ammo-stack boxes carry the same read. O8, tone-first.
- **§B4 containment: PASS.** 0/20 documented cert; wrap geometry clean
  at 4× both ends.
- **§B5 parenting: PASS.** 0/0/0; baskets/cable/links all verified in
  the correct rigs by audit.
- **§B6 trapezoid: PASS.** \\________/ reads both ends; ramps honest;
  the persisting refOnly ramp LINES are the horn-tip serration
  amplitude defeating the evaluator's line fit, not a shape defect
  (O10b — same class defeats the 8 wrap-arc pairings).
- **§D discipline:** official rigs only; parity clean; every claim
  above carries evaluator numbers or ITU-601 rects
  (tools/tmp-cent5r7-tone.py reproduces end-to-end); corner-bias ±4°
  findings cited only where Δ exceeds the printed band; borderClips
  honored (1/1/3 in hero-rr/close-front/close-roof — zero orders at
  them); certified classes (vane anchor tax, zb 1.28, station-0 trim,
  phantom stern band, 20-vox graze, turret_side interp-null pair)
  checked present and NOT ordered.
- **§H.4 VARIANT-DISTINCTIVENESS (centurion3 ac63e6d8 fresh board,
  chieftain5 5117b9a8 graduate board): PASS, STRENGTHENED.** vs
  centurion3 at a glance: (1) the L7 drum band — now a tone-split fat
  band, the loudest tell (r6's WEAK item delivered); (2) bustle-flank
  basket panels both sides (c3 bare); (3) M2 + vane cluster vs c3's
  MAG; (4) mk5 periscope hump. Front-on the two marks still read
  near-identical (tells live in side/3-4 — accepted r6 caveat). vs
  chieftain5: unambiguous, and the r6 caveat is RESOLVED — with the
  wall dead, the honest tells (L7-with-drum vs sleeved L11, basket
  bustle vs NBC pack, skirt-with-exposed-discs vs terraced bins) carry
  the distinction, not a defect.

## Calibration note

Severity anchored to the ratified chieftain5 ladder per the f04beee
ruling: r4 wall-hides-gear 5.0 → r5 driver-cured floor 7.0 → r6
graduate 9.0. centurion5 today is measurably the r5 stage: identity
cured, machine green, one cast-shading campaign + polish family
remaining — floor 7.0. The same-hour challenger1 verdict used the same
anchor (5.5/6.3 pre-fix); no cross-critic split this round.

## Orders — priced vs 90.5 (turret 0.5 / whole 0.7 / hull 2.6 headroom)

Gate-hold binds every order: geometry edits re-gate ≥90 ×2 on final
bytes, siblings re-hash EXACT, and invalidate this verdict per §G.

**O3 — CAST-TURRET READ under §B1 (geometry; THE round: clears the slab
classes in 8 views + all 4 casting arcs).** Carried from r6 verbatim,
now unbanked: (a) cheek-to-wall chamfer continuing the rake's line into
the flank plane; (b) crown ridge + 2.60 step-tab re-planed co-planar
onto the rake (FLAT-CAP-BEHIND-A-RAKE; kills the ±14.5/±14.3 flag
family); (c) cupola 3-ring stack → domed read (the 104° r0.102 arc @
(−0.82, 2.81); facet inside the certified 2.85 class — the p95 anchor
is the VANE, untouched); (d) bustle corners eased to the ref's rounded
plan-rear (answers 154°/165°/81° arcs). Gate risk MEDIUM: turret 0.5
headroom — the r6 six-batch pattern (official gate between batches),
turret_plan 96.9 columns are the guard rail, dAlong 1.237 frozen, the
trim-boundary columns must not re-poison.

**O7 — WHEEL-FACE ARTICULATION (material-first; clears the pale-blob
row in left/right/quarters/heroes).** Disc interiors 64.5/p95 73.2 vs
ref 51.4/55.9: drop the lit dish faces into the ref band and SPLIT the
wheel tones — dark tire/rim ring, mid dish, distinct hub ring — so the
rim + hub circles read at 1× (the ref's inter-wheel verticals y
0.19–0.48 and disc rings are the 20/25 refOnly edges in the side
views). The dished geometry exists (r1 packet); this is tone slots +
maybe an inside-silhouette hub ring — mask-neutral, floaters ×2 after.
Optional sub-item: hem 0.84 → 0.81 (the r2 outer-strip bottom) IF
byte-verified mask-neutral; the ref shows a hair more disc.

**O8 — §B3 DISCHARGER TUBE READ (tone-first; clears the mystery-box
hits in front/hero-fl/close-front).** Give the twin bins their tell:
scalloped tube-mouth row (dark mouths + pale tips) painted on the
top-front face — mask-neutral first pass; only go geometric (tube tips
proud of the bin) if tone fails at 1×, priced against the turret front
columns (96.9 guard) + front_whole rows. Same treatment or deletion
for the cheek ammo-stack boxes (lid seams/latches per the law).

**O9 — REAR BASKET PANEL PARITY (material, small).** Panels 53.8 vs
ref 65.2 — lift toward ~60–65 with a dot/weave hint (the rebucket
overshot dark past the ref's light woven read). Gate-free.

**O10 — SHOULD set (≤0.4 allowance + carried items):** (a) M2
dark-crown polarity: receiver 44.2 vs crown 44.4 — darken the gun
metal (~35) or give it a contrast plane so the closest view reads a
weapon; (b) wrap/ramp serration amplitude: the horn-tip zigzag defeats
8 wrap-arc + 2 ramp-line pairings — if a cheap outer-pad-line flatten
exists inside stations 95.5, take it, else document as texture-class
residual; (c) bow periscope lids +23..28 over deck 41.4 — half-step
toward deck tone; (d) drum neutral nudge toward (50,53,44) keeping the
band tell; (e) top-view procOnly panel-line thinning where free.

## Honest positives (carry forward)

The tone round delivered everything it claimed, to the rect: gear
exposed at in-family tone, wraps at EXACT ref parity in the front
rects, hood kept-and-cured, blue dead, bore disc at the exact tip
plane, tail composition complete, drum tell working §H.4 duty. Gate
90.5 ×2 to the decimal with zero headroom spent; hash steady through
the whole campaign; all five machine audits green; both certified
oracle classes + the turret_side interp-null residual correctly
absorbed; the warm-family audit proves the palette discipline held
(0–5 px per view, ref-identical). The r5/r6 geometry laws (two-
threshold, p95-anchor-x-cost, ramp-pad, station widths) all visibly
paying under fresh renders. This is a one-campaign tank now.

## Evidence

- shots/critic-centurion5/ (14 fresh pairs, this round, hash 2395a924)
- shots/visual-eval-centurion5/ (report.json + overlays, rig parity
  clean, camoSeed 4242)
- tools/tmp-cent5r7-tone.py (every verdict rect, reproduces end-to-end)
- Machine: gate ×2 PASS identical lines, standard-check PASS,
  track-clip 0/20, turret-parent 0/0/0, hashes ×2 (start + close)
- Siblings for §H.4: shots/critic-centurion3/ (fresh, post-tone bytes),
  shots/critic-chieftain5/ (graduate board, hash-verified 5117b9a8)
- Builder evidence audited: shots/uk-tone-combined/ (c5-gear-after crop
  corroborates the O7 finding)
