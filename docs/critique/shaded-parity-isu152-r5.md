# isu152 shaded-parity verdict — post-r5 (independent critic)

Date: 2026-08-03. Judged build: **842889c** (isu152 r5 landing commit).
Provenance: HEAD was exactly 842889c at render time; the entire isu152 render
path is CLEAN (casemate.js, userdrops6.js, tankFactory.js, materials.js,
modelLoader.js, profiles/kit.js, decorations.js, specs.js, and the isu152
reference GLB all unmodified). Dirty files in the tree (abrams/leopard/misc/
russia profiles, UI files) are outside the isu152 path.

Pairs: re-rendered fresh via `node tools/tmp-tank-critic.mjs --id=isu152`
(vite :7487, 14/14 saved 2026-08-03 14:58, zero console errors) →
`shots/critic-isu152/*.png`; every scored file is **byte-identical** to the
builder's archived finals in `shots/isu152-r5/` (cmp verified on 4 spot
files) — deterministic rig, same build. Scored ONLY the fresh files.
Measurement: `tools/tmp-isu152r5c-stats.py` (ITU-601 luma, bg discriminator
|px−0x151b20| maxch ≤13, rect coordinates in pane space). Registration
audit: all 14 pane bboxes within ±6px (view-left IDENTICAL 549×156 both
panes; view-right identical; close-roof +15h is frame-edge clipping, not
drift). Standard check re-run this session: gate 90.2, contig 0 ✓,
clip 306/582 (matches packet disclosure), decor mg0+0d (packet-justified
hand-authored DShK).

## HEADLINE: FAIL — floor 8.5. Ten of fourteen views reach 9.0; four hold
## at 8.5 (view-frontleft, view-frontright, view-top, hero-frontleft).
## NOT graduation — but the r4 floor items are ALL cured; what remains is
## one systemic flank-layering story plus two view-top plan signatures.

r5 is the second consecutive round where **every builder number I
re-measured reproduces on the official rig**, including the r3-parked
window-sky item, delivered this round via the order's own fallback clause.
All six r4 orders landed. The r4 floors (view-rear 8.0 composition,
hero-toptilt 8.0 roof relief) are cured outright — both score 9.0 now. Min
8.0 → 8.5, mean 8.43 → **8.86**. The remaining gap is concentrated where no
order has yet aimed: the front-quarter flank reads slab-vs-layered against
the ref, the bow flap pocket's void paint reads as black cutout blocks at
quarter angles, and the plan view keeps two signature drifts (round
ball-collar vs the ref's rectangular mantlet housing; the new louver band
slices the deck dome).

## Per-view scores

| view | r4 | r5 | justification |
|---|---|---|---|
| view-front | 8.5 | **9.0** | Order 3b lands: the gun no longer emerges at the crest — a bright cast-ball mass (130-luma crown vs 83-106 surrounds) hangs at the root, col-profile x918-922 shows crest spike y156, ball crown y196-224 ≈ 0.19-0.24 m below crest (claim 0.174 geo, consistent). Face carries frame + MG-port ring + beam + ribbed bins; same vehicle, same tier. Residuals: ref's chunky bright bow-comb row vs proc's dark slot band (never ordered), proc mid-beam more prominent than ref's joint line, recessed-frame vs proud-ball mantlet architecture (certified divergence). |
| view-frontleft | 8.5 | **8.5** | The one systemic story left. Stacked-crop comparison: ref flank is LAYERED (bright fender ledge, dark shadow run under it, big bright-rimmed wheels, casemate/hull tone break); proc flank is one tall tone-plane wall — seams exist, tone doesn't split. Plus the bow flap pocket (pane ~(330-450, 340-410)) shows the 6-28L void paint as hard black checker blocks between wrap/flap/wheel — reads cutout, ref's same zone reads structured shadow. Gear windows + ribs + DShK all good; the r4 murk item is cured. |
| view-left | 8.5 | **9.0** | Silhouette EXACT (549×156 both). r4 holders cured: window band dark+sky **24.4% vs ref 26.7%** in the identical r4 rect (r4 proc was 10.6%) — murk-vs-sky is dead, remaining 2.3% is the certified wheel/far-band ceiling; y392-398 ALL 0.7-1.8% dark (r4 y396 was 40.2%); muzzle sky-break intact (x323-328: S43-44/G2-3/S5-7/roof — r4-certified pattern EXACT). Stern teeth 0.67 vs ref 0.75 at z −3.25 (claim 0.68/0.76 ✓). Residual: descent still serrated at 3×, flank flatness least visible dead-side. |
| view-rearleft | 8.5 | **9.0** | Single drum per shoulder at the ref's own lower position ✓, dressed crates ✓, curl horn ✓. Flank partially dressed by drums/crate at this angle. Under-stern void band reads as shadow at 1×. |
| view-rear | 8.0 | **9.0** | All three r4 crimes cured, measured: crest rows 124-136 width ratio **worst 1.150** (order ≤1.2, r4 1.24-1.39; row 122 = 1.175 is the disclosed AA row, still <1.2) — the shoebox is now the ref's trapezoid; ONE drum circle per shoulder (proc drum centers match the ref's lower circles within ~6px); crates PROUD with handrail line + C-hook ring + panel relief (the r2 buried-fittings bug found and fixed). Residuals: dressing is subtler than ref's bold rod+shackle; ref shows a second upper-shoulder circle the proc no longer carries (the order said one — ref-render re-read says the ref stacks two per side; composition note, not a floor); 78 enclosed-bg px are standoff bracket slots (physically correct standoffs, ref reads 0 because its fittings are flush). |
| view-rearright | 8.5 | **9.0** | As rearleft; drum pile with cap rings still the best single element. Idler-gap openness 188 px vs ref 60 — reads as gear shadow at 1×. |
| view-right | 8.5 | **9.0** | Mirror of left + the ordered curl horn EXISTS (two-lane swept tip riding the ref's own descent; top line within +0.017-0.05 of ref over z −2.90..−3.28). Stepped 4-segment read vs ref's smooth arc + wrap-occlusion sky 6.4% vs 14.6% are the disclosed bounds. |
| view-frontright | 8.5 | **8.5** | Mirror of frontleft: slab flank + bow-pocket black checkers ((240,360) cluster, 129 px). Cheek MG-port ring and face read well. |
| view-top | 8.5 | **8.5** | Delivered: intake cell p05 58.6/56.7 (ordered 55-65 band; r4 print-black), louver slat band present with right rail, deck bars 0, studs, dome, bright donut, covers. Held by two plan signatures: gun-root plan mass is a round ball+collar ~28px wide vs the ref's rectangular housing slab ~48px (r4 item, never ordered); the new louver band OVERLAYS the dome circle — ref composes slats ENDING at the dome rim, proc slices the dome into crescents. |
| hero-frontleft | 8.5 | **8.5** | First-glance read is still "slab-sided box" next to the ref's layered flank — the fender ledge/shadow/wheel story dominates this angle at 1.55× distance. Everything else strong: casemate, ball+horn, DShK cluster, dressed deck, bow. Same deduction as the front quarters, same fix. |
| hero-rearright | 8.5 | **9.0** | Crate slabs dressed, single drum row, curl arcs on flaps: the r4 holders are gone. Rear-quarter flank partially dressed by fittings; reads same tier. |
| hero-toptilt | 8.0 | **9.0** | All three r4 floor items cured, measured: both mounds carry real sub-50L rim-shadow arcs (96/66 px in my zones vs r4 ZERO in the roof zone; builder's 56/44 clusters contained within) + pale crown ellipses — raised drums at tilt, not painted rings; intake cells recessed-grate family; louver band present. Deck reads dimensional. Residuals: dome-slice + plan-mantlet (scored at view-top). |
| close-front | 8.5 | **9.0** | Nose signature parity delivered: rounded proud root ball (smooth three-segment horn kept), dark bore + stepped tip, ribbed bins, frame bars. Ref's recess+frame architecture remains its own design; mass no longer reads 55-60% light. Ball zone iqr 22.1 vs ref 12.1 (livelier roll-off — visible, disclosed). |
| close-roof | 8.5 | **9.0** | Order 3e verified pixel-level: the 25 painted dots are raised round studs with real normals + top-lit crowns; R-cupola lid flips PALE — luma map shows lid band 104-111 (claim 107.9 class) over 82-class plate with 48-67 ring shadows — top-lit physics correct, dark aperture stays a flank slit. DShK still reads: pintle + receiver + aft-up barrel visible in plan and close-roof; wall-band mottle in ref family. |

## Claims audit (official pairs, ref-render outranks row analysis)

Second consecutive round of full reproduction — every headline number
re-measured lands:

- **Rear crest ratio**: worst in ordered band 1.150 @y124 (claim 1.153);
  rows 138-164 read 0.977-1.008 = the ref's own taper band. Row 122 (outside
  band) 1.175 — disclosed, still <1.2.
- **Single drums**: one cap-circle per shoulder in view-rear; proc drum
  positions match the ref's LOWER circles. Note: on my re-read the ref pane
  shows a second upper-shoulder circle per side (the r4 "one soft circle"
  read undercounted) — the delivered state matches the ORDER, not quite the
  ref; carried as a composition note only.
- **Crate dressing**: proud band with panel relief + handrail + C-hook ring
  visible; subtler than ref's fittings but present (relief was flat-0 in r4).
- **Mound rim shadows**: sub-50L arcs at BOTH toptilt mounds (96 + 66 px in
  my generous zones ⊇ builder's 56/44 clusters; r4 had zero).
- **Intake cells**: p05 58.6/56.7 in the r4 rects — ordered 55-65 band hit.
  (Ref's own cells in the same rects read p05 82.5 — the order's band, per
  craft law, is the law; noted for future calibration.)
- **Window band**: dark+sky 24.4% vs ref 26.7% in the r4 rect (builder's
  rect: 25.9 vs 28.4 — consistent). r4 was 10.6%. Panel p05 6.1 EXACT match.
  The 2.3% residual = the r3-documented wheel-radius/far-band ceiling; the
  void paint literally reads as bg to the mask method (intended read). This
  order is CLOSED — nothing further to order within bounds.
- **Mantlet ball**: bright round crown starts 40px below the crest spike at
  the ball column (≈0.19-0.24 m visual vs 0.174 geo claim — the horn top
  face sits between; consistent).
- **y396**: 0.7% dark EXACT (r4 40.2%); whole y392-398 band 0.7-1.8%.
- **R-cupola lid**: 104-111 luma band = claim's 107.9 class; polarity fixed.
- **Stern teeth**: tail bottoms 0.67 vs ref 0.75 at z −3.25 (claim
  0.68/0.76); x74+ columns match ref exactly.
- **Muzzle sky-break**: r4-certified pattern reproduces EXACTLY (6 cols,
  2-3 gun px over 5-7 sky px) — the DShK is untouched, as claimed.

## Owner laws

- NO EMPTY AREAS / CONTIGUITY: **PASS** — hole scan on all 14 proc panes
  finds no hull/turret sky-through; enclosed-bg counts are ref-family
  everywhere (view-right proc 1182 vs ref 1042 = the open-gear window read;
  close-front proc 245 vs ref 873). view-rear's 78 px vs ref 0 are
  standoff-fitting slots (handrail feet, comb teeth, mound-step gaps over
  the crest) — physically correct standoffs, masses read attached at 1×.
  Standard-check contig 0 ✓.
- DECORATION MINIMUM / MG PHYSICS: **MET (carried r4 certification)** — the
  hand-authored DShK is unchanged (sky-break pattern byte-consistent);
  reads at close-roof (pintle/receiver/barrel), plan (aft-up barrel line),
  and view-left (certified pattern). Census mg0+0d stands on the packet
  justification (KIT.fittings landed mid-round; migration is a fittings
  round, not this one).
- TRACK CONTAINMENT: **PASS visually** at bow and stern, both flanks, front
  and rear wraps at 1× and 8× zoom — the curl horn plates ride clear of the
  wrap with a sky slot between; no hull solid crosses a track band. The
  audit's 306/582 vs the ≤60 bar: 308/526 pre-dates the bar at the
  r4-committed state; the +56 rear delta is the ordered curl horn at
  x 1.418+ outboard of the pin-cap row — no visible intersection anywhere I
  looked. Stays flagged for the queued orchestrator containment round; NOT
  floored here per the pre-dating rule.

## Fix orders (r6) — all four 8.5s trace to three stories; every order
## respects the certified bounds (nothing above 2.494, no sub-45L without
## the unhooked mat, windows/flap-occlusion/sprocket/idler untouched)

1. **FLANK LAYERING** (view-frontleft, view-frontright, hero-frontleft —
   the whole residual half-class): paint + rim work only, silhouette-free.
   (a) Fender shadow run: a dark line (55-65L class — above the 51.3
   ambient clamp) immediately under the sponson/fender lip along the full
   hull side, both flanks — the ref's quarters show a continuous 3-5px
   shadow run under the fender ledge (ref frontleft pane y≈300-310,
   x≈90-450); the proc wall meets the tarp band with no break.
   (b) Tone-split the side: skirt band (sponson bottom → wheel tops) ~5L
   below the upper wall (wall p50 ~94 → skirt ~88-90), one clean split, no
   new mottle (mottle amplitudes are at their r4-halved values — keep).
   (c) Wheel rim presence: pale upper-rim crescents (+0.10-0.15 crown
   class) on all six road wheels per side — ref wheels read bright-rimmed
   and big; kit wheel r 0.30 is certified, so brighten, never resize.
2. **BOW FLAP-POCKET VOID CHECKERS** (view-frontleft (330-450, 340-410) +
   mirror): the 6-28L void paint between front flap/wrap/first wheel reads
   as hard black cutout blocks at quarter angles. Lift ONLY the bow-pocket
   panels to the deep-shadow class (48-55L; they sit on the already-unhooked
   shadow mat, so the clamp is no obstacle in either direction) — the ref's
   same pocket reads ~50L structured shadow. Do NOT touch the inter-wheel
   window panels or the stern pocket (certified window read + priced
   occlusion residual).
3. **VIEW-TOP plan signatures** (view-top, echoes at hero-toptilt):
   (a) Mantlet housing: widen the gun-root plan mass from ~28px (ball +
   collar) toward the ref's ~48px rectangular housing block (ref pane
   (280-360, 370-425)): flat cheek fairings flanking the ball root, top
   faces below the 2.22 ring band, side silhouette under the existing horn
   line, front silhouette inside the face — builder prices the plan/station
   risk; if it costs >0.1 gate pts, deliver as top-face PAINT (housing-tone
   rectangle + edge shadow lines) — the (0,1,0.02) plan read is tone-driven.
   (b) Dome-slice: end the louver slat band at the dome rim instead of
   crossing it (split into the two part-bands the ref composes — ref slats
   stop where the dome circle begins); keep the delivered 76-93 slat minima
   and the right end rail.

Gate notes for the orchestrator: nothing here adds geometry above 2.394;
orders 1-2 are pure paint (zero silhouette); order 3a is the only priced
item and carries its own paint fallback. The pintle allowance rests at
0.35/0.4 untouched. Track-containment round and KIT.fittings migration stay
queued as separate rounds per the packet.

Verdict: **FAIL — graduation blocked; floor 8.5 (view-frontleft,
view-frontright, view-top, hero-frontleft).** Ten views at 9.0, including
both r4 floors. Claim discipline: two clean rounds running. r6 is a
paint-and-planform round — smaller than r5; the flank story is the last
systemic item between this build and §10.
