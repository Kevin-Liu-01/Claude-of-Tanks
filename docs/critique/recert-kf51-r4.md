# kf51 re-certification verdict — track-containment r4 (2026-08-03): **RE-CERT: YES**

Graduate-change re-cert (§H3/§B4), changed regions only — the r8 graduation
cert stands elsewhere. Rig: fresh `tools/tmp-tank-critic.mjs --id=kf51`
pairs (shots/critic-kf51/, 14/14 views, zero console errors) at the
working-tree geometry, hash-verified **77020c58** (299 meshes / 105936
verts) = exactly the round's claimed freeze state.

## Official-rig evidence (§D)

- `visual-evaluator --id=kf51`: exit 0, **no RIG MISMATCH** — yawProxy
  0.0–1.7° (front 0.0°, rear 1.7°, top 0.1°, close-front 0.2°; gate is 10°).
  Evidence at shots/visual-eval-kf51/ (report.json + overlays).
- Profile p95 (world m): front Δtop 0.266 / Δbot 0.144 · rear 0.248/0.183 ·
  left 0.168/0.082 · right 0.153/0.075 · top 0.117/0.413. Every ~1.0 m
  profile flag carries the tool's own "at vertical edge — cliff offset,
  not height error" disclaimer (bustle rear cliff z −3.14, turret cliff
  z ≈ 0.05). No arc reads polygonal in any changed region (paired arcs 0;
  the close-front proc arc is the certified round bore).
- Audits reproduced independently: `track-clip-audit --exact` **front 0 /
  rear 0**; `tank-standard-check` gate 90.4 = certified components
  94.9/91/90.4/92.1/97.8/100, **contiguity 0** (§B2 top-down scan — the
  first-cut hole is machine-closed), clip 0/0. `decor mg0+0d` is the
  pre-existing certified carry (hand-authored MG5 predates KIT.fittings,
  packet-justified) — not a regression.
- TRUE see-through scan (mask method tightened to |px−0x151b20| maxch ≤3,
  flood-from-border, per pane; tol-13 matches the certified near-black
  16-class paint and is unusable here — the 3697px "void" at x843..1076
  y435..470 in rear IS the chevron band, and the evaluator's flagged
  enclosed-voids (hero-toptilt 5.530 m², close-roof 0.186 m²) resolve to
  dark bay paint + barrel/deck projection air, ≤24px true-navy, per its
  own §B2 caveat): **proc ≤ ref's own class on all 14 views.** Highlights
  (excl. the ~55px "PROCEDURAL" label counters present in every pane):
  left/right proc ≈0px vs ref's own 533/538 · top proc ≈61px scattered
  vs ref 16 (the old 18-cell hole would be ~1000px-class — CLOSED) ·
  rear proc ≈180px (certified open-frame tower slats + 42px flap slits)
  vs ref's own 475px incl. 258/201px flap slits · front proc ≈258px
  (certified MG sky slot + flap slits) vs ref 915px.

## Per-focus-view scores (changed regions, absolute read)

| view | score | read |
|---|---|---|
| front | **9.0** | Nose lane-split invisible at 1x: tan panel spans pin-cap to pin-cap (±0.94 seam columns read occupied bay, zero navy); belly line intact; bow shows no wrap clipping. |
| close-front | **9.0** | Idler wrap fully contained at zoom: pads pass BETWEEN the split filler boards (ramp band reads as track), mudflap boards + hanger step attached to the fender line, mudguard slivers ride the glacis top line. Faint z≈3.13 shell seam on the tan panel reads as a panel joint — sub-noticeable, non-blocking. |
| rear | **9.0** | The notched wall reads as the vehicle's real rear: full plate face track-to-track, chevron V still spans plate edge to plate edge (arm ends at x 0.944 = 1 voxel inboard; rendered V visually unchanged), hexes/tie bar/exhaust slits at certified stations; the open mid-band is 100% pad-occluded — zero sky. |
| rearleft / rearright | **9.0 / 9.0** | Wrap passes the notch with parallax and still shows no sky (strict scan 223/98px = tower-slat class + label); sponson-tail + tub-floor wings read as continuous hull courses; no plate penetration; sprocket arch shadow matches ref's own. |
| hero-rearright | **9.0** | Bustle/plate/wrap composition certified-intact; 46px slit at the far idler = ref-class artifact size. |
| left / right | **9.0 / 9.0** | Chevron arm ends invisible in profile (nothing pokes past the stern); flap boards hang inside the wrap voids and read attached; bow/stern wrap arcs inside hull ends at 1x; proc true-enclosed ≈0 vs ref's own 533/538px. |
| top | **9.0** | The r4 first-cut hole is CLOSED (render + machine agree); fore-fender slivers read as ribbed mudguard plates filling the bow corners exactly where the ref's own plan cols 1.62..1.73 carry a mudguard face; plan silhouette class-matched (proc straight side rail vs ref's segmented courses is the certified flank geometry, p95 Δtop 0.117 m). |
| hero-toptilt | **9.0** | Deck closed at 55°: no sky through hull or turret interior; the evaluator's 5.530 m² flag is image-space dark-paint/barrel air (strict-mask ≤24px), dismissed with numbers above. |

KF51 grammar (graduation packet identity cues) survives in every pair:
faceted sloped cheeks + stepped crown, SEOSS tower + rod-farm/bustle
skyline, squared slat bustle with open-frame tower, fat round Rh-130 with
blocky muzzle, skirt courses + hex camo, black corner flaps.

## Non-blocking residuals (declared)

- Glacis tan-shell split seam at close-front zoom (panel-joint read).
- Close-front unmatched proc lower-front edge 12.1° len 0.34 m @world
  z 3.56..3.79 y 0.34..0.41 — the new ramp/board package; UNMATCHED (no
  ref pair, no Δ-claim); bounded by front Δbot p95 0.144 m.
- Pre-existing certified carries unchanged: chevron arms 13.6° vs ref
  ~30° (tail-bin canvas), dark-band chevron fill style vs ref recessed
  line-work, ring dia cap, 3 gate-mandated rod columns.

## VERDICT

**RE-CERT: YES.** Focus views 9.0 across the board; containment 765/144 →
0/0 and §B2 hole 18 cells → 0 reproduced on the official tools; zero true
see-through beyond the ref's own class on all 14 views; gate byte-holds
the certified 90.4 components. Re-freeze at hash **77020c58** is granted.
