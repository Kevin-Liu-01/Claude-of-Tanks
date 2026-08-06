# ABRAMS FAMILY §B1.1 CHEEK + §B3.1 GUN RUN — INDEPENDENT RE-CERT (five graduates)

Date 2026-08-06. Independent adversarial re-cert critic for the landed
d501a48 abrams round (owner reports verbatim: "left cheek of all abrams
have weird rectangles instead of the correct slopes"; "sepv2 and sepv3
... have those really ugly gun rectangular prisms and dont look
accurate"). Under review: five graduate candidates — m1a1 / m1a1ha /
m1a2 / m1a2_tejas / m1a2_sepv2 — left-cheek stair prisms -> raked
chord-toe wedges at the family 34.8° (shared tejasRoofKit lines), gun
runs de-prismed (trio segmented elliptical thermal jackets + cinch
rings; m1a2/sepv2 elliptical armored-sleeve housings + clamp rings +
MRS spine + throat disks, shared buildM1a2 lines). All renders and
measurements below are my own runs on the official rigs (§D), fresh
this session, at the verdict hashes.

## VERDICT — RE-CERT PASS, all five tanks

| tank        | floor | mean | gate x2 (frozen row EXACT)                    | re-freeze hash      |
|-------------|-------|------|-----------------------------------------------|---------------------|
| m1a1        | 9.1   | 9.20 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)     | 66f953e4 (42/151444)|
| m1a1ha      | 9.1   | 9.20 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)     | cd209f68 (42/151120)|
| m1a2        | 9.1   | 9.24 | 91.0 = 91.0 (93/92.8/91/93.4/100/100)         | b78279b4 (42/110324)|
| m1a2_tejas  | 9.1   | 9.20 | 89.4 = 89.4 (91.7/89.4/89.8/93.9/100/100)     | 25304310 (43/150760)|
| m1a2_sepv2  | 9.1   | 9.24 | 91.3 = 91.3 (93.1/92.4/91.3/93.4/100/100)     | b74366ac (42/110180)|

(Floors/means over the 10-view DIFF-DERIVED contract of §4 — the 6
packet-named views plus the 4 gun-run-spill views my diffs surfaced,
per the CHANGED-VIEW-LISTS-ARE-DIFF-DERIVED law banked at d5e6cfa.)

Orchestrator may re-freeze all five at the candidate hashes. No
gate-blocking orders. Residuals reported to the family lane (§4).

## 1. Provenance

- HEAD d501a48 (the landed round) throughout. I made NO src/GLB edits,
  no checkouts; scratch tooling only under tools/tmp-* (gitignored /
  untracked), evidence under shots/ (gitignored), this doc.
- Pre-existing working-tree state on arrival: uncommitted probe-field
  jitter in docs/geometry-gate/{m1a1,m1a1ha,m1a2_tejas}.json + a ledger
  row-reorder/timestamp delta (a post-landing gate run by another
  session; component rows identical to committed). My own gate runs
  rewrite the same tool-owned artifacts. Frozen component rows EXACT
  in every run I made.
- Hash bracket (tmp-hashgeo x2, BEFORE and AFTER all browser work):
  all five ids stable at the candidate hashes above, both runs — every
  render in this verdict was made at the verdict hashes (§J law).
- FIFO discipline: all 5x14 critic pairs + the two §J yaw pairs were
  rendered under ONE ticket by a batch driver on the identical render
  path (tools/tmp-cheekgun-critic-batch.mjs, clone of the
  tmp-b1b3-critic-batch precedent; zero console errors, favicon 404
  only). Official self-ticketing rigs (gate, standard-check,
  turret-parent, visual-evaluator) ran bare, never wrapped.
- Determinism: my fresh pairs (shots/critic-<id>-cheekgun/) are 0-diff
  (t>2) against the builder's shots/abrams-cheek-r1/after-<id>/ on ALL
  14 views x ALL 5 tanks — builder evidence = shipping truth.
- Change locality (builder before/after archives, t>4, halves split):
  REF halves 0 px on all 70 pairs (no framing drift). PROC diffs
  concentrate at the turret front + gun run (trio view-front 12.6-13k
  px shading, frontleft 2.2-2.5k; m1a2/sepv2 4.2-4.5k front) with
  small gun-run spill into top/roof/rear views (m1a2/sepv2 view-rear
  literally 0). Per the diff-derived-changed-views law (banked mid-run,
  see below) the scoring contract is NOT the packet's named 6 alone:
  my diffs surface view-front (the LARGEST diff on the trio,
  12.6-13k px), close-roof (6.5-10k), hero-toptilt (2.1-2.4k) and
  view-top (1.2-2.1k) as changed — all four read at 3x-4x and SCORED
  per tank in §4.
- MID-RUN LANDINGS: 991f50b (merkava 3b/3c re-cert ratification) and
  d5e6cfa (leo2_revolution r19 ratification) landed while my renders
  ran — both verified DOCS-ONLY (BUILD-STANDARD law lines,
  PROGRAM-STATE, packets, critique docs; zero source or tool bytes,
  d501a48..d5e6cfa stat checked). My hash bracket spans both with all
  five candidates stable, so no render in this verdict predates or
  straddles a byte change. The law banked there (CHANGED-VIEW LISTS
  ARE DIFF-DERIVED, §J) is applied in this verdict's scoring contract.

## 2. Standing checks (all measured myself)

1. geometry-gate x2: frozen rows EXACT both runs, all five (table
   above). Trio 89.4 wholeCurves = the banked pre-existing
   override-path-drift baseline (certified 2026-08-03), not this
   round's spend.
2. tmp-hashgeo x2 bracketing every render: five candidates stable
   (§1).
3. §J yaw-90 pairs re-rendered by me at the verdict hashes (m1a1 +
   m1a2_sepv2, shots/abrams-cheekgun-recert/yaw{0,90}-*): m1a1 cheek
   wedges + relocated left M250 cluster + toe lip all ride rig_turret
   (plan silhouette rotates whole; no stranded cheek geometry on the
   hull front); sepv2 D/E housings/rings/boot ride the yawed run; the
   hull-pinned works field stays hull-side per its ORACLE-REGISTRATION-
   PINNED cert. Decks read filled at yaw; no §B2 sky through interiors.
4. tank-standard-check: contig/holes 0, clip 0/0, census mg1+1d — all
   five PASS (machine-gate "2/5" line is the gate>=90 term; the trio's
   89.4 is the certified baseline row, held exact).
5. §B5 turret-parent audit: m1a1/m1a1ha/m1a2/m1a2_tejas stranded 0 /
   abutting 0 / dangling 0; m1a2_sepv2 stranded 2 / abutting 0 /
   dangling 0 = EXACTLY the certified registration-pinned classes
   (45% works-cloth + 26% hullDetail, graduation cert, byte-same).
6. visual-evaluator (official, camoSeed 4242, run per id): RIG PARITY
   OK all five (max dYawProxy 1.3-1.4°, max |dCentroid| 0.061 m —
   nowhere near the 10° abort bar). Flag decomposition in §4.

## 3. The owner reads, hunted at 1x-4x (my fresh pairs)

### §B1.1 left cheek — the colonnade is DEAD on all five
- BEFORE (builder archive, my crop): m1a1-class frontleft shows the r3
  stair boxes + shelf boxes + vertical chord plate as a colonnade of
  flat vertical planks beside the gun root — the owner's exact read.
- AFTER (my renders): ONE raked bulge face rising at the family rake
  into the swept cheek plane, chord toe at its base; the left M250
  cluster rides ON the raked face (asymmetric detail on the plane, as
  §B1.1 demands). Camo carries continuously across the face. No
  vertical plank seams at 1x-4x in frontleft/frontright/close-front/
  hero-frontleft on any of the five.
- BOTH cheeks checked per §B1.1 on every tank (frontleft + frontright
  quarters): right cheeks keep their certified raked reads (trio
  34.8°; m1a2/sepv2 38.2/40.4° chin-split layers). No boxy cheek on
  either side anywhere.
- The wedge zone seam (parallel raked planes 0.10 apart, weld at
  x -1.077) reads as a single armor course line, co-planar joint class
  — §B1 stair language does not apply (it is not equal-height
  quantization; the two faces lie on the SAME rake).
- m1a2/sepv2: the owner's "left cheek" read on these ids was the D/E
  prism train riding beside the left cheek (packet adjudication) —
  gone with the §B3.1 swap; their §B1-certified cheek layers are
  untouched this round (right-quarter reads confirm).

### §B3.1 gun runs — no prism reads anywhere on the runs
- Trio (m1a1/m1a1ha/m1a2_tejas): the two dust-cover BOXES are gone;
  the M256 now reads segmented thermal jacket (three elliptical
  sleeve sections + sub-column cinch grooves with dark cinch rings +
  recessed joint ring + sleeve-B + mouth washer) -> evac drum -> tube
  -> muzzle collar. Dead-front the gun mouth is concentric CIRCLES
  (washer/jacket rim/tube) where the boxes formerly showed a square
  rim. Side views: jacket top line straight AT the certified envelope
  with ring seams; hero/toptilt: highlight wraps the cylinder.
- m1a2/m1a2_sepv2: the D1/step/D2 stacked boxes + crown pairs + E-band
  slab train are gone. Dead-front and both front quarters the housing
  reads as an elliptical DRUM: curved rim arcs, elliptical sleeve
  mouth, tube exiting through the dark boot collar; the clamp collar
  steps read as wrapping rings (pale ring pair + dark tension segment
  visible at 4x as ring seams, not plate corners); MRS spine reads as
  a slim rounded ridge. Pure-side the silhouette is the certified
  envelope rectangle BY CONSTRUCTION (cylinder-at-prism-envelope law)
  — the round read there rides on the top-edge highlight, lower
  falloff, wrapped camo, and ring seams, and that is what my 4x crops
  show; the box corner cues (end-corner verticals, uniform slab tone)
  are gone. The ref print's own band is envelope-rectangular in side
  view, so parity holds.
- close-roof/view-top/hero-toptilt (gun-run spill views): jacket rings
  and drum shoulders read round from above; plan lines stay at the
  certified plan envelope (straight by construction, matching the
  ref's own plan). No new plan blobs, no holes.

### §H.4 variant distinctness (five-up, my fresh hero-frontleft strip)
Five distinct reads sharing the raked-front + sleeved-M256 family
identity: m1a1 mono-green, CWS, stowed M2, wall cable, slim jacket;
m1a1ha two-tone, shielded stowed M2, spare links; m1a2 SEP works
field, CIPs, paneled skirts, D/E drum; m1a2_tejas CROWS mast + whips +
fuller rack; m1a2_sepv2 bold two-tone, twin fifties, rigid crate, CIP
pair + bin tells on the same D/E drum. m1a2 vs sepv2 share the housing
blocks (shared lines, certified) but scheme + roof loadout + skirt
furniture separate them at a garage glance. No 'same tank re-badged'
pair. PASS.

### Unchanged-view spot-checks (one+ per tank)
Five-up view-rear strip: bustle racks, grilles, tow points, track runs
all intact; trio rear diffs are the muzzle/jacket tip over the bustle
(280-535 px), m1a2/sepv2 view-rear 0-diff — carried graduation
verdicts stand. No regression anywhere outside the changed zones
(pixel-diff §1 is the proof; the eyeball agrees).

## 4. Scores — DIFF-DERIVED changed views, graduation bar (>=9.0 every view)

Packet-named six, then the four diff-surfaced gun-run-spill views:

| view           | m1a1 | m1a1ha | m1a2 | m1a2_tejas | m1a2_sepv2 |
|----------------|------|--------|------|------------|------------|
| view-frontleft | 9.2  | 9.2    | 9.3  | 9.2        | 9.3        |
| view-frontright| 9.2  | 9.2    | 9.2  | 9.2        | 9.2        |
| view-left      | 9.2  | 9.2    | 9.1  | 9.2        | 9.1        |
| view-right     | 9.1  | 9.1    | 9.1  | 9.1        | 9.1        |
| close-front    | 9.2  | 9.2    | 9.3  | 9.2        | 9.3        |
| hero-frontleft | 9.3  | 9.3    | 9.3  | 9.3        | 9.3        |
| view-front     | 9.2  | 9.2    | 9.3  | 9.2        | 9.3        |
| view-top       | 9.2  | 9.2    | 9.2  | 9.2        | 9.2        |
| close-roof     | 9.2  | 9.2    | 9.3  | 9.2        | 9.3        |
| hero-toptilt   | 9.2  | 9.2    | 9.3  | 9.2        | 9.3        |
| floor / mean   | 9.1 / 9.20 | 9.1 / 9.20 | 9.1 / 9.24 | 9.1 / 9.20 | 9.1 / 9.24 |

(view-front is the trio's largest diff — the re-angled cheek planes
re-shade on an unchanged silhouette, gun mouth now concentric circles;
close-roof/hero-toptilt carry the jacket/drum-from-above reads;
view-top holds the certified plan lines with ring stations. m1a1ha's
view-top/hero-toptilt reads are the byte-shared trio lines verified on
both siblings at 3x plus its own 8 other views.)

Every changed view >= 9.0 on every tank. The 9.1s are honest: the
pure-side drum/jacket reads lean on shading + seam grammar at the
certified envelope (correct under the law, but a shade less vivid than
the quarter views), and the trio right-side run carries the two small
measured deltas below.

### Honest residuals (documented, none gate-blocking; family lane)
- TRIO CHIN-STEP CLASS (measured, evaluator): frontleft edge Δ+14.5°
  ±0.6° on a 0.46 m chin-line edge @ world z 2.04..2.37, y 1.52..1.53
  (identical read on m1a1/m1a1ha/tejas — shared lines). The ref's
  cheek-bottom chamfer line RISES (~13.8°: side bots 1.536->1.563
  over z 2.15->2.26); the wedge chins are flat steps at the CERTIFIED
  side/front-column bottoms (1.45w/1.57w + seam toe lip) — the packet's
  declared constraint. At 1x-2x it reads as the turret's lower lip; at
  4x a single ledge step at the seam, not a colonnade. Adjudicated
  RESIDUAL under the certified-bottoms constraint, reported for the
  family lane (a raked chin chamfer would need a certified-row change).
- TRIO EVAC/TUBE TRANSITION: view-right Δ-14.6° ±4° on a 0.35 m edge
  @ z 3.38..3.70 y 1.72 — the print tapers into the evac where the
  proc steps ring-to-ring (grammar-legal, slightly harder than the
  print); and the 3.26 m tube top line reads Δ+1.6° ±0.1° (print sags
  ~0.9°, proc cylinder straight). Both sub-perceptual at 1x.
- m1a1ha frontright Δ+14.9° ±4° @ z 3.19..3.21 y 0.67..0.89 is BOW/
  hull-zone (y<1), outside this round's change bboxes — pre-existing
  carry, not priced here.
- m1a2/sepv2 evaluator top flags are all REAR-zone carry classes
  (hero-rearright/rearright/rear) — their rear views diffed 0-280 px
  this round (view-rear 0); pre-existing, carried by the graduation
  verdicts.
- m1a2/sepv2 D/E plan + pure-side reads are envelope-rectangles by
  construction (certified rows); roundness legitimately absent from
  those two projections. Score already reflects it.

## 5. Per-tank verdicts

- m1a1: RE-CERT PASS (re-freeze 66f953e4)
- m1a1ha: RE-CERT PASS (re-freeze cd209f68)
- m1a2: RE-CERT PASS (re-freeze b78279b4)
- m1a2_tejas: RE-CERT PASS (re-freeze 25304310)
- m1a2_sepv2: RE-CERT PASS (re-freeze b74366ac)

Orders: none mandatory. Recommended (family lane, non-blocking): bank
the trio chin-step class for the next certified-row round (raked chin
chamfer at the ref's 13.8° line); consider a print-matched evac taper
ring on the trio if a future round touches the run.

## 6. Law discoveries (for the bank)

- ENVELOPE-SWAP SIDE-READ LAW (§B3.1 corollary): a cylinder-at-prism-
  envelope conversion is INVISIBLE in the two projections it preserves
  (pure side, plan) — critics must judge §B3.1 there by shading
  gradient + joint/ring grammar, never by silhouette, or every honest
  envelope-preserving swap false-fails. The quarter views + dead-front
  mouth are where the roundness is testable.
- CHIN-STEP ADJUDICATION (§B1.1 corollary): when certified side/front
  column bottoms pin a stepped chin under a raked cheek, the evaluator
  will flag a horizontal-vs-chamfer Δ at the chin line; adjudicate
  against the packet's certified-bottoms constraint before ordering
  geometry — a single constraint ledge is not the §B1 colonnade class.
- Reconfirmed this run: §J yaw-pair evidence re-rendered at verdict
  hashes; one-ticket batch drivers on the identical render path are
  the FIFO-honest shape for multi-tank critic renders (5 tanks x 14
  pairs + 2 yaw pairs in one ~13 min hold); pair-PNG label band
  excluded from any flood tooling.
