# t90m — INDEPENDENT GRADUATION ADJUDICATION (2026-08-06)

Graduation critic verdict for the program's 27th candidate: the dedicated
PERFECTION round (81.7 → 90.7 PASS ×2, bcf6166) on buildT90MProryv
(src/vehicles/profiles/russia.js, RUSSIA_PROFILES). State certified: the
committed HEAD tree (russia.js clean at HEAD throughout; two foreign
landings — d954975 moderns, 7e8d892 track-hitboxes — occurred mid-session
and moved NO t90m geometry, hash-bracket-proven). Candidate proc hash
**4acdebe4 (49 meshes / 76609 verts)**.

## HEADLINE: **GRADUATION FAIL floor 8.4** — gate PASS ×2 at the packet
## line to the decimal (90.7 | 90.7/91.3/93.2/94.4/100/100) and every
## machine gate is green, but the 14-view shaded-parity bar is NOT met:
## 2 of 14 views reach ≥9.0 (mean 8.76, floor 8.4 at view-left/right).
## The candidate fails on three mask-blind visual classes the gate
## structurally cannot see: (1) the running gear is curtained — wheels
## not countable at 1x in either side view (§B8.1.1) while the oracle
## render and ALL THREE certified/built family siblings (t72b3m, pt91m,
## t90sm) show countable exposed wheels; (2) the rear fuel drums render
## default-detail warm TAN against the oracle's green steel (loudest
## single element in four views); (3) the turret roof carries no
## circular crew-hatch reads (ref: bold cupola ring + second hatch) and
## the Relikt cheek/glacis tile arrays read as faint seams at zoom.
## Four precise orders below; geometry orders invalidate 4acdebe4.

## Provenance (§D discipline — everything below measured by this critic)

- Hash bracket (tools/tmp-hashgeo.mjs BEFORE and AFTER all renders):
  **4acdebe4 (49/76609)** both times. Frozen sibs byte-exact both
  checks: pt91m 2cf10e23, t72b3m 1e1ca4b8, t84 04707a9c (tool prints
  unpadded `toString(16)` — 4707a9c ≡ 04707a9c, formatter-verified).
  Two foreign landings occurred mid-session (moderns d954975; sim-lane
  track-hitbox 7e8d892 touching tankFactory.js/specs.js) — the bracket
  plus a mid-session page-context census (49/76609 + exact fittings
  census + official-arithmetic in-context hash 4acdebe4) prove the
  candidate build never moved. NOTE for tooling: tmp-hashgeo's fnv is
  `(h*0x01000193)>>>0` — float64-rounded above 2^53; the rounding is
  part of the recorded hash's definition. Shift-add "exact" FNV gives
  DIFFERENT numbers — never cross-compare implementations.
- GATE ×2 (consecutive official runs): **min 90.7 | hull 90.7 whole
  91.3 turret 93.2 stations 94.4 dims 100 floaters 100 PASS** — both
  runs identical to the decimal, = the packet claim exactly.
- Pairs rendered FRESH by this critic (tools/tmp-tank-critic.mjs, own
  FIFO ticket, zero console errors); scored ONLY
  shots/critic-t90m/*.png. My 14 pairs are **byte-identical 14/14** to
  the builder's evidence set (preserved to critic scratchpad first) —
  deterministic pipeline, honest builder shots.
- `visual-evaluator --id=t90m`: exit 0, **RIG PARITY OK all 14 views**
  — yawProxy ≤1.1° (max @close-front), no flips; the r30 top-view
  false positive did NOT fire. Report: shots/visual-eval-t90m/.
- `track-clip-audit --exact`: **band 0/0 AND shoe 0/0, blind spots 0**.
- `standard-check`: gateMin 90.7 fresh, clip 0/0 ✓, contig 0 ✓,
  decor **mg1+4d** ✓ (Kord/T05BV-1 pintleMG + PKT stub + 902B banks +
  links + cable).
- `winding-audit` both modes: mode 1 **rev 0 / mix 0 / FrontSide
  deficit 0px** across 9 views (census 567 pieces, 0 flagged). Mode 2
  HARD flag adjudicated: candidates are EXACTLY the rear fuel-drum rack
  cluster (rig_hull mesh#21/#22/#19, z −2.92..−3.42, |x|≤0.99, px
  1330/161/93) — hull rear-plate furniture the bustle overhangs, §B5
  hull-correct on the real vehicle, the packet's documented negative.
  Nothing turret-owned strands (coincidencePx 16046 = turret-subtree
  statics per §J).
- §J yaw pair at the verdict hash (tmp-merkava-b5-yawpair page,
  in-context census-proven 4acdebe4): turret kit — bustle bins, rails,
  527-marked cheek flank, roof cluster — sweeps through yaw-90 while
  hull skirts/flaps/rack stay pixel-static. The T05BV-1 group is
  turret-parented and rotates. Evidence: critic scratchpad
  yawpair-t90m.png + crops.
- Packet residuals re-measured in THIS session's gate JSON — all four
  **priced, not papered**: bustle −2.30 teeter family reads ≤0.036
  errM this phase (inside the certified line both runs; worst-case
  phase ~0.077 as documented); muzzle/notch center columns ±0.06 carry
  0.076 ×2 (plan_whole, spec-datum class); front-ramp convex class
  tops read 0.03-0.034 (side_hull at −0.43/−0.56); turret_side cover
  read 0 this run (the trim-window flip is phase-dependent as
  documented). No worst column anywhere exceeds its packet claim.

## Per-view scores (fresh pairs vs the CC-BY minehffd oracle, graduation severity)

| view            | score | named reads |
|-----------------|-------|-------------|
| view-left       | **8.4** | FAIL-class: wheels not countable at 1x — Relikt half-bag hem + dark trim + hull-green wheels + shoe chain read as a wall to the track; REF shows six dark wheels at ~40-60% exposure (hem scan: ref sustained-skirt starts y≈0.43-0.52 mid-hull, 0.68-0.74 at flap ends; proc runs bright content to ~0.02-0.31). Rooﬂine tiers, bustle staircase, skirt taper, sleeve/evac/collar all strong. |
| view-right      | **8.4** | Same mechanism mirrored; asymmetric shoulders read correctly (L-low roof). |
| view-front      | 9.0   | Silhouette + §B3.1 complete (bore disc end-on, collar, boot behind hood); cheek wedges + hump covers + staircase shoulders right; glacis ERA ribbing lighter than the print's bake (packet-priced residual); front track towers a shade proud (convex-ramp residual, 0.03-class). |
| view-rear       | 8.7   | Fuel drums render warm TAN (mats.detail default) dead-center at eye level vs the oracle's green steel drum ends with strap detail; bin/mesh faces flatter than the print's bolted plate; staircase rack, center notch, log below, flap hangs, bustle asymmetry all correct. |
| view-top        | 8.8   | Plan silhouette + welded staircase planform excellent (gate plan rows 92.7/93.5); tan drum pair loud at the stern edge; no circular hatch reads where the ref shows two; roof relief light. |
| view-frontleft  | 8.9   | Identity strong; left cheek raked with cassette inset (§B1.1 ✓); wheels covered where the ref shows the run; ERA relief light. |
| view-frontright | 8.9   | Right cheek raked (§B1.1 both-cheeks ✓); same wheel-cover and relief reads. |
| view-rearleft   | 8.7   | Tan drums + covered wheels; rack/log silhouette correct. |
| view-rearright  | 8.7   | Drum tone loudest here; bustle tail-tier asym (right-deep) matches ref. |
| hero-frontleft  | 8.9   | Cheek cassette insets read flat at hero zoom vs the ref's bold chevron arrays; glacis relief light; masses/kit correct. |
| hero-rearright  | 8.7   | Tan drums at zoom; bustle walls flat vs the ref's mesh-basket read; wheels covered. |
| hero-toptilt    | 8.8   | Roof reads clean-but-plain vs the ref's busy roof: no hatch circles, faint tile relief; tiers/humps/sight heads/RWS masses all present and placed right. |
| close-front     | **9.1** | §B3.1 showcase: tube cylinder + thermal sleeve step + evac swell + crest fin + ruBoot accordion collar at the root + bored muzzle behind the elliptical reference collar — NO prism anywhere on the gun run; §B3.1-addendum bore read confirmed end-on. |
| close-roof      | **8.6** | No commander's cupola ring or gunner's hatch read (ref: bold circular cupola + second hatch — basic crew-hatch grammar, §B3/§B2 circular-reads); Relikt cheek arrays near-absent as relief (faint seams vs the ref's 3D chevron courses); T05BV-1 cluster present and grammatical (pedestal, sensor drum, bin) but reads faint under the hump covers. |

Floor **8.4** (view-left, view-right) · mean **8.76** · ≥9.0: 2/14.

## Why the gate said PASS and the critic says FAIL

All three failing classes are structurally invisible to the measurement
stack: wheel exposure and hatch rings are INTERIOR reads (silhouette
rows and plan masks see neither), and drum tone is material-only (every
mask is geometry). This is the §C.1/§B8 pattern — machine gates green,
player-visible reads wrong — and exactly what the critic lane exists to
catch. §B8's acid question fails on the sides: at 1x the running gear
reads "skirt wall over track", the owner's named puma/type89 complaint
class, while the oracle and all three family siblings read wheels.

## ORDERS (next t90m round; geometry orders invalidate 4acdebe4)

1. RUNNING-GEAR EXPOSURE (view-left/right, quarters; §B8.1.1 + family
   precedent): raise the Relikt half-bag hem + band/trim treatment so
   the upper wheel run reads — target the ORACLE RENDER's hem line
   (ref render: bags hem ~0.43-0.52 mid-hull, flap zones 0.68-0.74;
   re-derive per-z from a fresh workorder AND the render, §D
   render-outranks-rows — note the extract's skirt rows were already
   proven wrong once, r26), and move road wheels to the family
   dark-tire tone (materials wheelsDark kind; t72b3m hub/seam-ring
   precedent) so exposed wheels read as wheels, not hull. MASK-COST
   WARNING: the bags carry priced side-mask bottoms (authored y
   0.48..1.34) — the hem lift moves side rows; REGISTRATION-ANCHOR law
   applies (bow/stern span extremes FROZEN; expect the −2.30 teeter
   family to re-phase). Done-gate: six wheels countable at 1x in BOTH
   side views; gate ≥90 every component ×2; clip --exact 0/0 band+shoe
   held; §B6 trapezoid held.
2. DRUM TONE (rear family views + top; tone-ORDERED class): the two
   0.84 m fuel drums + coupling + straps ride 'hullDetail' →
   mats.detail, whose default tint is wheelTone-coupled warm tan; the
   t90m profile never retints it (t72b3m does, r16/r18). Retint
   P.mats.detail toward the oracle's green-steel drum read (sample the
   ref drum-end zone) or re-bucket the drum set to a green slot; the
   unditching log STAYS wood-tan. Tone-only and mask-free; hashgeo
   hashes geometry only, so a pure retint HOLDS 4acdebe4.
3. TURRET CREW HATCHES (close-roof/top/toptilt; §B3 equipment grammar
   + §B2 circular-in-plan): author the commander's cupola ring (the
   T05BV-1 rides the cupola ring on the real vehicle) + gunner's hatch
   ring/lid — ring + lid seam + periscope studs (t72b3m stud
   precedent), near-flush relief (≤3 cm) inside the plateau's
   certified rows and the heightM p95 budget; verify stations i5/i7
   and plan rows unmoved (interior relief).
4. TILE RELIEF (close-roof/heroes/front; the packet's own named
   weakest read, confirmed at graduation zoom): give the Relikt cheek
   cassettes + glacis ERA their tile-course relief — the ref reads
   bold chevron courses; author courses interior to the masks
   (sub-half-pixel proud faces per the SSC margin discipline; the
   45°-shoulder free lane applies on the wedge shoulders). Done-gate:
   cheek zones read tile courses at 2x in hero-frontleft/close-roof;
   gate held.

Re-cert: orders 1/3/4 move geometry → new candidate hash, dual gate ×2,
FULL fresh 14-view adjudication at the new bytes. Order 2 alone would
be a changed-view re-cert but lands with the rest.

FOR THE ORCHESTRATOR (no builder action):
- winding-audit mode-2 HARD on t90m = the adjudicated hull-correct drum
  rack; consider a certified-class annotation (merkava-tail-pack
  pattern) so fleet runs stop re-flagging it.
- The r30 evaluator top-view skew-normalization flag remains open
  (did not fire this session).

## §H.4 distinctness (standing check — PASS)

t90m vs t90sm/t72b3m/pt91m at a glance: welded staircase-planform
turret + roof-hump RWS + rear drum rack + full-length Relikt skirt line
(t90m) vs t90sm's shroud-backed turret and exposed spoked wheels vs
t72b3m's cast dome + K-1 cheeks + tail snorkel rack vs pt91m's ERAWA
cheeks + side bins. No re-badge read. (Ironically the sibling lineup is
also the family evidence for order 1 — every other member shows its
wheels.)

## Law-bank candidates (this adjudication)

- DETAIL-SLOT LOUD-CARRIER: mats.detail's default is wheelTone-coupled
  warm tan — fine for small fittings, wrong-class when 'hullDetail'
  carries LARGE equipment (0.8 m drums). Any profile hanging big gear
  on the detail slot retints it (t72b3m precedent) or re-buckets.
- INTERIOR-READ TRIAD: wheel exposure, hatch rings, and equipment tone
  are all mask-invisible — §B8.1's wheel-countability check applies to
  ORACLE-BACKED graduations against the ORACLE RENDER, not just
  photo-class builds; critics run it explicitly on every side pair.
- HASH-IMPL PINNING: tmp-hashgeo's fnv multiply saturates float64 and
  its rounding defines the recorded hashes — replicating the algorithm
  requires the byte-identical arithmetic, not "correct" FNV-1a
  (shift-add differs on ~50% of samples).

VERDICT: **GRADUATION FAIL floor 8.4** — machine gates green and the
gate line certified exactly as claimed; the visual bar is not met on 12
of 14 views with three named, cheap, mechanism-level fixes. Re-run the
adjudication after the order round lands.
