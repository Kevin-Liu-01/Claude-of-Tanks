# kf51 re-certification verdict — §B1 turret-front r11 (2026-08-04): **RE-CERT: PASS**

Graduate-change re-cert (BUILD-STANDARD §B1 turret extension / GEOMETRY-GATE
§10), changed views only — the r8 graduation cert + r4 containment re-cert
stand elsewhere. Owner directive: "update the turret front of the kf51."

Rig: fresh `tools/tmp-tank-critic.mjs --id=kf51` (shots/critic-kf51/, 14/14
views, zero console errors) at the working-tree leopard.js, hash-verified
**3ae9b70c** (299 meshes / 106404 verts) at campaign START and END — stable
through every render and gate run despite the concurrent russia-builder
session (leo2a5 bc9bad30 / leo2a6 80b76338 / leo2_revolution f6a1d3c0
byte-identical throughout; leo2a6's 80b76338 confirmed as its own sanctioned
re-freeze in docs/references/tanks/leo2a6.md). Every fresh render is
BYTE-IDENTICAL to the builder's shots/leopard-r11/after-kf51/ archive — the
r11 evidence is honest and is exactly this geometry.

## THE §B1 READ (the one-sentence version)

The staircase is dead: every front-family view now shows the print's wedge
nose — one continuous raked hood falling from the crown band to a sharp prow
on the certified plan arc, faceted cheek strips sweeping around it, V-wings
riding the facet planes — with no vertical slab, no shelf, no ledge anywhere
at 1x or 4x.

Before/after pairs (builder archive vs my fresh renders, diagnosed at 2-4x):
- frontleft/frontright: BEFORE carries the terraced read (dead-vertical nose
  slab, horizontal shelf, second vertical ledge + recess boxes); AFTER is a
  single hood plane with angular facet strips catching distinct light values.
- left/right leading edge (4x): BEFORE shows the squared nose-slab step
  poking forward under the gun; AFTER reads crown → hood rake → prow →
  chin tuck in one clean profile line, mirrored cleanly (no winding
  artifacts, facets shade correctly on both sides).
- close-front (2x): wedge + V-wing plates on the facets + round bore; the
  under-chin recedes into shadow behind the prow. The documented chin-depth
  residual reads as SHADOW DEPTH only — visible only when A/B-ing the two
  prow overhangs directly; invisible at 1x, non-blocking at 2x.
- hero-toptilt (3x): the plan silhouette is UNCHANGED (certified plan-arc
  polyline kept — outline curve identical before/after); only the surface
  topology changed from terraced to raked; deck fully closed.

## Official-rig evidence (§D)

- geometry-gate ×2 (fresh, sequential): **min 90.4 PASS both**, components
  IDENTICAL between runs = 94.9 / 90.9 / 90.4 / 92.3 / 97.8 / 100
  (hull/whole/turret/stations/dims/floaters). The 90.4 graduation-record
  headline HELD; whole 90.9 (−0.1 vs record, binder unchanged), stations
  92.3 (+0.2 over record) — exactly the r11 packet claim.
- `tank-standard-check`: clip 0/0, **contiguity 0** (§B2 flood clean);
  decor mg0+0d = the pre-existing certified §B3 packet-justification carry
  (hand-authored MG5 predates KIT.fittings) — not a regression.
- `visual-evaluator --id=kf51`: exit 0, **no RIG MISMATCH** — yawProxy
  0.0–1.7° (front 0.0°, rear 1.7° = the r11 claim exactly; gate is 10°).
  Evidence shots/visual-eval-kf51/ (report.json + overlays, camoSeed 4242).
  - Turret-front zone (world y 1.55–2.65, z 1.75–3.35), all views swept:
    rearleft hood contour Δ+4.3° ±0.4° (0.96 m) and chin contour Δ−3.9°
    ±0.3° (1.08 m) — the two priced r11 flags, reproduced to the decimal;
    mirrors rearright −3.0°/+4.0°. frontright hood MATCHES at Δ−0.3° ±0.3°
    over a 1.34 m edge (the cleanest measured read of the new hood).
    True-profile hood deltas left −3.9° / right +2.5° sit INSIDE the ±4.0°
    corner-bias noise floor = NO-FINDING per §D calibration. front view:
    ZERO flagged zone edges.
  - Worst digest edges located and cleared as pre-existing classes OUTSIDE
    the changed zone: left −11.4° @ [−0.01, 1.59, −3.83] (rear hull),
    close-front −13.5° @ [−2.25, 3.47, 1.94] (whip top), frontleft +11.6°
    @ [0.47, 2.56, 1.89] (certified fore-roof/crown line — r11 kept the
    crown on its certified plane, only its foot rose).
  - Ortho p95 profiles are IDENTICAL to the pre-r11 values the r4 re-cert
    documented from hash 77020c58 (front 0.266/0.144 · rear 0.248/0.183 ·
    left 0.168/0.082 · right 0.153/0.075 · top 0.117/0.413 m): the profile
    layer did not move anywhere the r11 didn't claim.
- §B1 probe cross-check (tools/tmp-kf51-frontfacet-probe.mjs re-run fresh;
  ref AND proc data byte-identical to the builder's archived after-probe;
  my own line fits, tools/tmp-b1recert-fit.py): PRINT prow y 1.84 /
  z 3.129, hood slope −2.760 = **70.1° from vertical** (one plane, max
  resid 17 mm); PROC prow y 1.84 / z 3.134 (+5 mm, the certified plan-arc
  carrier), hood −2.694 = **69.6°** (Δ0.5°, resid 116 mm = the documented
  ≤0.11 m V-wing/notch-liner furniture riding the facets); chin proc 81.0°
  vs ref 82.1° with 409 mm resid = the documented shallow-chin depth class.
- §B2 TRUE see-through scan (mask |px−0x151b20| maxch ≤3 + blue-signature
  B−R ≥ +8, flood-from-border, per pane; ~65 px of pane-label text counters
  present in every pane): close-front and close-roof PROC ≈ **0 real px**
  (label-only — the evaluator's 0.111 m² hood-zone "void" is dark paint,
  not sky); front ≈275 px = the certified MG-sky-slot + flap-slit class
  (ref's own 913 px); hero-toptilt largest blob 24 px = EXACTLY the r4
  certified class for its recurring 5.530 m² dark-paint flag; top ≈51 px
  scattered (r4 class ≈61); frontleft/frontright 50/56 px slivers, well
  under ref's own classes. No new see-through anywhere.
- §B5 spot-confirm (standing adjudication): `turret-parent-audit` fresh =
  **stranded 62 / abutting 19 / dangling 0**, rig_hull 100% — the r11
  counts to the digit; offender JSON samples top out at y 1.74w/1.65w,
  BELOW the 1.97w bustle bottom = deck-height hull kit (the documented
  raised-deck AABB artifact, §B5's own kf51 caveat). Yaw-90 pair verified
  in render (yaw0/yaw90, left + front): bustle block + 6-socket plate,
  whips, SEOSS, and MG all ROTATE; deck plates, exhaust cluster, and tail
  bins STAY; the chin sweeps the flank with a continuous shadow gap — no
  clipping at diagonal yaw. Adjudication (no re-parents) CONFIRMED.
- §H.4 family strip (kf51 | leo2a5 | leo2a6 | leo2_revolution, + 2x
  turret-front A/B vs leo2a5): kf51's low-raked one-plane hood + prow +
  crown band + SEOSS/rod-farm skyline vs a5/a6's paneled slab-cheek fronts
  and revolution's AMAP boxes — unmistakable at a glance, and FURTHER from
  the family class than the old staircase front was. Variant tells hold.
- npm test: equipment 166/166 + track-geometry green.

## Per-changed-view scores (graduation standard, ≥9.0 bar)

| view | score | read |
|---|---|---|
| front | **9.0** | Plan-arc silhouette held (front-mask bottoms now on the ref's own 1.84w prow line); wedge facets + V-wings read in the mantlet zone; zero flagged zone edges; §B2 at the certified class, well under ref's own. |
| frontleft | **9.0** | Staircase dead; raked hood + facet strips + sharp prow; zone flags are the two priced classes (+4.2° ±0.5 hood/prow corner = single-plane-per-strip, bounded by the certified plan arc; +11.6° = pre-existing fore-roof carry). |
| frontright | **9.0** | Mirror clean; the new hood contour MATCHES the print at Δ−0.3° ±0.3° over 1.34 m — the best-measured edge of the round. |
| left | **9.0** | Leading edge reads crown → hood → prow → chin-tuck in one line; hood Δ−3.9° inside the ±4.0° noise floor (no-finding); the nose-slab step is gone from the profile. |
| right | **9.0** | Mirrored identically (+2.5° in-noise); no winding artifacts; facet shading correct. |
| hero-frontleft | **9.5** | The graduation 9.5 holds: composition untouched, and the changed front is strictly better — facets catch light correctly in perspective, prow clean over the bow. |
| close-front | **9.0** | Wedge + V-wings + round bore at zoom; ≈0 real enclosed sky; chin-depth residual reads as shadow depth only; −13.5° digest edge confirmed at the whip top, not the front. |
| hero-toptilt | **9.0** | Same certified plan arc, surface now raked; deck closed (24 px = certified artifact class); facet creases read as the print's angular shell. |

KF51 grammar (graduation identity cues) survives in every pair: faceted
sloped cheeks + stepped crown — now with the WEDGE nose the print actually
carries — SEOSS tower + rod-farm/bustle skyline, squared slat bustle with
open-frame tower, fat round Rh-130 with blocky muzzle, skirt courses + hex
camo, black corner flaps.

## Non-blocking residuals (declared, all measured)

- CHIN DEPTH (the r11 headline residual, re-verified): proc chin bottoms
  1.84w vs the print's 1.62→1.84 sweep (chin cols +0.05..+0.12; probe fit
  81.0° vs 82.1° with 409 mm resid). ARTICULATION-BOUND: the print's own
  depth would clip the 1.82w flank-course tops at diagonal yaw (yaw-90
  render shows the current floor clearing with a visible shadow gap).
  Carries the dy −0.011 registration refit. At 1x invisible; at 2x a
  shadow-depth read only.
- rearleft/rearright hood-contour Δ+4.3°/−3.0° — the plan-sweep component
  reading into the 3/4 projection (single-plane-per-strip class, bounded
  by the certified plan arc).
- The 2.244w shoulder spans +0.15 m deeper than the print's (cols ≤ +0.02;
  brow-foot/shelf geometry bound); proc-only chin-band bottom edges at the
  rear quarters (the shallow-chin class's own lines).
- Pre-existing certified carries unchanged and re-confirmed at their exact
  values: fore-roof +11.6° line, whip-top −13.5°, rear-hull −11.4°,
  plan_turret ±1.48/1.51 lerp cols, pot-cap/SEOSS heightM trades, mg0+0d
  packet carry, chevron/tail-bin classes.

## VERDICT

**RE-CERT: PASS.** Every changed view ≥9.0 (min 9.0, hero-frontleft 9.5);
the §B1 wedge read is delivered and measured (hood Δ0.5° off the print,
prow on the print's line, staircase extinct); gate ×2 byte-holds the 90.4
graduation record; §B2/§B4/§B5/§H.4 standing checks all clean or
certified-carry; hash **3ae9b70c** stable start-to-end. Orchestrator may
land leopard.js + the packet section and RE-FREEZE **3ae9b70c** (299
meshes / 106404 verts) in the same commit.
