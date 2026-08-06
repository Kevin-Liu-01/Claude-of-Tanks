# m1a1ha rear-fix — INDEPENDENT GRADUATE-CHANGE RE-CERT verdict (2026-08-05)

Graduate-change re-cert (BUILD-STANDARD §B1-6/§B2/§B3/§B4 + GEOMETRY-GATE
§10) for the owner-priority fix: "tracks are glitching through and theres
gaps between stuff in the model. fix!" (owner screenshot, m1a1ha rear 3/4).
The round: rear flap DELETED (it sat fully inside the sprocket-shoe sweep;
the ref's own -3.778 band is its parked shoes), front flap re-hung at
z 3.620 (≥1.6 cm sweep clearance, same trace column), corner tongues close
the §B4 lane-carve channel, TIP box + grille straps + pintle base re-toned
off the void-black class with §B3 bin tells. All m1a1ha-gated; siblings
byte-identical.

## HEADLINE: **RE-CERT PASS** — floor 9.0, mean 9.09 over the nine changed
## views; the owner's two defect classes are DEAD on the official pairs
## (no shoe-through-furniture read anywhere at 1x-5x; no stepped
## see-through channel at either rear corner; no void-black rear
## fittings). Gate held the frozen row EXACTLY ×2; track-clip --exact 0/0;
## §B5 audit 0/0/0. Orchestrator may land abrams.js + packet and
## RE-FREEZE m1a1ha at **f5c556dc** (46 meshes / 158608 verts),
## superseding 5c765fc4.

## Provenance (§D discipline — everything below measured by this critic)

- Working-tree state certified: src/vehicles/profiles/abrams.js
  UNCOMMITTED diff audited hunk-by-hunk (g.frontFlapZ / g.noRearFlap
  opt-ins, corner tongues in buildTejasFamily m1a1ha block, tejasRearKit
  softDark — all vid-gated to m1a1ha; defaults byte-identical).
- Shared-file dirt audited: materials.js (applyCamoPatternsChunked — NEW
  function, game-side chunked repaint), modelLoader.js (linkWait phase,
  capture contexts commit immediately via inShotPhase()), state.js/main.js
  (game perf lane), leopard.js (other family lane). None touch the
  offline render/measurement path; determinism proven below.
- Hash bracket: `node tools/tmp-critic-hashgeo.mjs` (74xx-port clone of
  tmp-hashgeo) BEFORE and AFTER all renders — **f5c556dc (46/158608)**
  both times. Frozen siblings byte-exact both checks: m1a1 97c10194,
  m1a2 f3c34424, m1a2_tejas 3fcae440, m1a2_tusk f7ecade4,
  m1a2_sepv2 b489ba14.
- GATE ×2 (`node tools/geometry-gate.mjs --ids=m1a1ha,m1a2_sepv2`, runs
  consecutive): **min 89.4 | hull 91.7 whole 89.4 turret 89.8 stations
  93.9 dims 100 floaters 100** — BOTH runs identical and EXACTLY equal to
  the frozen graduate row (the pre-existing sub-90 drift row, held to the
  decimal; the parked-shoe analysis priced the flap deletion at exactly 0,
  confirmed).
- Pairs rendered FRESH by this critic:
  `node tools/tmp-b1b3-critic-batch.mjs --ids=m1a1ha,m1a2_sepv2` (one
  FIFO ticket, official render path, vite :7480), 14/14 saved, zero
  console errors. Scored ONLY `shots/critic-m1a1ha/*.png`. My fresh set
  is **byte-identical 14/14** to the builder's evidence — deterministic
  pipeline, honest builder shots.
- Builder before-set: shots/abrams-b3/m1a1ha-before/ (6 views) — used for
  defect-confirmation only.
- `node tools/visual-evaluator.mjs --id=m1a1ha` (camoSeed 4242): **RIG
  PARITY OK** — verdict OK, max yawProxy 1.64° @close-roof, no flips.
  Scoring valid. Report + overlays: shots/visual-eval-m1a1ha/ (this run;
  builder's 17:07 run archived to critic scratchpad before overwrite).
- `node tools/track-clip-audit.mjs --exact --ids=m1a1ha,m1a2_sepv2`:
  m1a1ha **front 0 / rear 0**. `node tools/turret-parent-audit.mjs`:
  m1a1ha **stranded 0 / abutting 0 / dangling 0** (no re-parent this
  round; yaw-90 pair N/A). `node tools/tank-standard-check.mjs`: gateMin
  89.4 (frozen row), clip 0/0 ✓, contig 0 ✓, decor mg1+1d ✓.

## The owner-defect read (the point of the round)

BEFORE (shots/abrams-b3/m1a1ha-before/, confirmed at 2-3x):
- view-rearleft/hero-rearright: the old rear flap plane hangs INSIDE the
  sprocket shoe run — shoes visibly pass through the plate (the owner's
  "tracks glitching through").
- Both rear corners: the §B4 lane carve leaves a stepped see-through
  channel from shelf ring to skirt over the sprocket ("gaps between
  stuff").
- The TIP box + grille frame straps fire pitch-black — void/hole reads on
  the corner wall and across the lit grille.

AFTER (my fresh pairs, same stations, 2-5x crops):
- Rear flap GONE; the sprocket wrap reads honest open bay exactly like
  the ref's own corner (ref half verified at the same crop); the parked
  pad run carries the -3.778-band columns the flap used to fake.
- Corner tongues close both corners: hull-toned fender-back plate, bolted
  edge lip (§B3 tell), welded into the shelf-ring wall; no sky through
  the corner at rear/rearleft/rearright/hero-rearright.
- Shoes clear ALL hull furniture through the full visible wrap at
  sprocket AND idler (audit 0/0 --exact + eyeball at 3-5x; front flap's
  re-hung extremes 3.596..3.644 vs idler envelope reach 3.580 —
  clearance math re-derived by this critic: sweep z at tongue-bottom
  y 1.55 = -3.5785 vs face -3.598 ⇒ 1.95 cm, checks out).
- TIP box reads as a wall bin: detail tone + pale mounting rail + lid
  seam + latch block + cable port at 5x; straps/pintle base read
  mid-shadow frame members in front of the lit grille, not slots.

## §B2 flood (mask-method maxch ≤13 AND blue-signature B−R ≥ +8;
## tools/tmp-abramswave-flood.py; label letter-holes at y13-21 excluded)

| view | ref true px | proc true px | read |
|---|---|---|---|
| view-rear | 105 | 176 | both = rack-frame windows (proc 120px @x104-114 = left rack window; ref's own 82px @x484-488 same class) |
| view-rearleft | 117 | 45 | proc CLEANER than ref |
| view-rearright | 131 | 69 | proc cleaner |
| hero-rearright | 110 | **0** | the owner's complaint view floods CLEAN |
| view-front | 46 | 488 | 316px = rack corner-post window (pre-existing, byte-present in before-set: before 555 ≥ after 543 total); 2×50px = 1-2px skirt-end AA slits, symmetric, pre-existing |
| close-front | 60 | 330 | 206px rack window class + thin fender slits; rack geometry untouched this round |
| view-left | 570 | 87 | ref carries slit/pocket classes; proc clean |
| view-right | 592 | 107 | as left |
| view-top | 18 | 13 | clean decks |
| hero-toptilt | 41 | 75 | rack windows at tilt |

NO new enclosed-air class introduced by the round (before-set floods ≥
after-set at every station; the changed zones all IMPROVED or held).

## Per-view scores (changed views, graduation-bar severity,
## chieftain5-anchor calibration)

| view | score | named reads |
|---|---|---|
| view-rear | **9.1** | Corner tongues close both corners; TIP bin + shadow-toned straps kill the void reads; grille slat parity; track columns contained; flood 176 vs ref 105 same class. |
| view-rearleft | **9.1** | Stern corner closed; honest sprocket bay = ref's own class; no shoe-through-furniture; certified rack rectilinearity carries. |
| view-rearright | **9.1** | Mirror of rearleft; contained; 69px flood vs ref 131. |
| hero-rearright | **9.2** | The owner's screenshot angle: flap deleted, wrap honest, tongue + bolted lip reads fabricated, TIP reads equipment; flood 0 true px vs ref 110. |
| view-front | **9.0** | Re-hung flap tabs symmetric behind fenders, no clipping; certified dead-ahead front-skyline band carries (named since graduation, priced). |
| view-left | **9.1** | Flap sits behind fender from pure side (same as certified state); §B6 trapezoid both-ends-raised; wheel/skirt language held. |
| view-right | **9.1** | Mirror of left. |
| close-front | **9.0** | Approach ramp shoes clear the flap with visible daylight; glacis one-line rake (§B1, no staircase); rack window = pre-existing certified class. |
| hero-toptilt | **9.1** | (marginal) Decks filled; corner blocks read attached; circular drums hold. |

Floor **9.0**, mean **9.09**. Every changed view reads same-vehicle,
same-tier; the two owner defect classes are gone; no view lost a
certified earn.

## Standing checks

- §B1 FRONT-SLOPE + NO-STAIRCASE: PASS (glacis one raked surface; turret
  cheek rake carries from the §B1 round).
- §B2 CONTIGUITY: PASS (table above; blue-signature law applied; no new
  class).
- §B3 DECOR / NO MYSTERY BOXES: PASS (TIP bin tells at 5x; mg1+1d census;
  stowed shielded M2 + spareTrackLinks variety loadout intact).
- §B4 TRACK CONTAINMENT: PASS (--exact 0/0 measured; visual at 3-5x
  through both wraps).
- §B5 PARENTING: PASS (audit 0/0/0; no bucket moves this round).
- §B6 TRACK RUN: PASS (raised idler + raised sprocket, \\____/ read both
  sides).
- §H.4 VARIETY: PASS — four-up strip (m1a1/m1a1ha/m1a2/m1a2_sepv2 fresh
  proc halves): m1a1ha reads distinct (red-brown two-tone + stowed
  shielded M2 + links strip vs m1a1's bare-roof M2 clean-green). No
  re-badge read.

## Honest residuals (carried, none introduced this round)

- The frozen row is sub-90 (whole 89.4) — the pre-existing override-path
  drift certified in the 2026-08-03 graduate round (orchestrator lane);
  this round held it to the decimal, ×2.
- Certified classes carried: dead-ahead front-skyline band, rack
  corner-post windows (ref carries the same class), 1-2px skirt-end AA
  slits, bustle-rack rectilinearity vs the ref's cast shell, oracle
  CROWS-cluster wholeCurves cap.
- m1a1 / m1a2_tejas / m1a2_tusk carry the SAME flap-in-sweep defect
  classes (same TEJAS_HULL numbers) — correctly REPORTED by the builder
  for their own graduate/band rounds, not forced into this lane. Ordered
  for scheduling, not for this landing.
- Below the tongues the open sprocket bay is the honest wrap — matches
  the ref's own corner; not a defect.

## Verdict

**RE-CERT PASS.** Land src/vehicles/profiles/abrams.js + the m1a1ha.md
packet section in ONE commit and RE-FREEZE m1a1ha at **f5c556dc**
(46 meshes / 158608 verts), superseding 5c765fc4. Gate row unchanged —
ledger needs no row edit. Independent critic: abrams-wave critic,
2026-08-05.
