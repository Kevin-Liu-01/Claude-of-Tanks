# Object 279 — reference packet

Soviet 1959 experimental nuclear-battlefield heavy: the "UFO". Signature
cues: full-width elliptical cast hull shield curving over FOUR tracks on twin
longitudinal beams, squat rounded dome turret, very long 130 mm M-65 (L/60)
with only a slim multi-slot muzzle device, rounded stern.

## Real dimensions (2 sources)
- Wikipedia (https://en.wikipedia.org/wiki/Obiekt_279): hull 6.77 m, with gun
  11.085 m, width 3.400 m, height 2.639 m, 60 t, 130 mm M-65 L/60,
  "elliptical shield" hull, all-cast rounded turret, four-track running gear.
- Tank Encyclopedia (https://tanks-encyclopedia.com/coldwar/USSR/object-279):
  same figures (60 t, four tracks, 130 mm M-65).
- Game spec `specs.js object279.dims`: hull 6.99, overall 10.24, w 3.4, h 2.6.

## GLB oracle
`/models/tanks/community/object279-snowleopard.glb` (Jt Steele /
SnowLeopard101, CC-BY 4.0). Gun fused into turret ⇒ loader normalizes on the
FULL box: hull rear-shifted in world (whole bbox centered).

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −4.84..+1.51 (len 6.36); roof flat 1.57 nearly full length
  (rear station 1.41), nose drop 1.34→1.01 over the last ~0.85 m.
- plan: full width 3.39 the whole length, rounded stern (rear station 2.21).
- front widths at y .35/.7/1.0/1.3/1.6/1.9/2.2:
  3.39/3.35/3.20/3.24/3.02/2.73/1.92 — the shell is full-width right down to
  y≈0.35 (tracks + curved skirt), gently rounding above.
- turret: flat wide dome z −2.81..+0.4, crown 2.38 (z −1.66), base y
  1.59-1.67; width ~2.73 at y1.9, 1.92 at y2.2.
- gun: muzzle +4.86 ⇒ 3.35 m past the bow; tube y 1.68-1.90 (axis ≈1.79,
  fat Ø≈0.2), tip slightly slimmer (1.70-1.86) — no fat brake drum.
- whole len 9.71, top 2.38.

## Build notes
Oracle frame replicated (hull center z ≈ −1.67). Turret pivot at dome center
(z ≈ −1.2, GLB pivot cfg [0, 1.4, −1.3]). One visible running-gear line per
side + inner track pair hinted under the shell; skirt carries the full-width
low silhouette.

## Final fidelity (2026-07-30)
67.6 → 91.2 — PASSES the 90/90 gate (H93 T86 G91 R93).

## Shaded-parity r2 (2026-07-30)
91.2 → 91.0 — still passes the 90/90 gate (H93 T85 G91 R93). Surface pass:
dark slot rings on the M-65 multi-slot muzzle; saddle collar + cheek plates
at the trunnion; dome hatch seams, low periscope pods, IR spotlight w/ glass,
handrails, lifting bosses; bow-crest driver hatch + periscopes + pike tow
hooks; stern exhaust ports + louvers seated ON the stern ellipse (z ≈ −4.95 —
anything shallower is buried); shield stud rows; dark wheel-face contrast.
Mismatch log: the four-track gimmick is expressed as dark-steel inner-track
WRAP STUBS at bow/stern + the beam shadow band. A full second sovGear pair
was tried twice and rejected by the masks: grounded inner tracks fill the
oracle's open centre-bottom (front 91.9→87.4) and a lifted pair leaks through
the outer band's scallop windows from the side (R 93→88). Head-on the stubs
give the twin-beam read; a true always-visible 4-track run is incompatible
with this oracle's silhouette.

r3 (shaded-parity r2): 91.0 → 90.9 (turret 85 → 87, gun 91 → 87 — the readable brake
costs a little crop mask, identity wins). M-65 multi-slot brake rebuilt from the r2
±0.01 collar stack (read as a bare tube) to a 1.4x-tube sleeve over 0.55 m with three
punched dark slot bands + entry taper + exit collar. Still >= 90 gate.

r4 verification (2026-07-31): untouched except the shared sovGear signature gaining optional
override params (defaults identical). Re-verified 90.9 (H93 T87 G87 R93, minView 91.6) — no
regression; still the family best.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 31.7 whole 0 turret 37.5 stations 55.6 dims 94.1 floaters 100
Dims vs published: heightM 2.57 hullL 6.93 overall 10.28 width 3.35 - gate: -1.27%/-1.24%/0.01%/-1.82% (width at the 3.40 committed flare).
Oracle audit (v6 true cameras, width-normalized frame): print DEFLATED: height -7.8% (2.397), hullLength -9.1% (6.352), overall -5.3% (9.702).
Certified oracle-defect caps (component | ceiling | cause):
- wholeCurves | ceiling ~0-25 | published-height dome (crown 2.60) overshoots the deflated print by ~0.2 m across the turret span AND the stretched shell (+0.64 m to published) overhangs its hull both ends - v6 double-counts as error+coverage
- hullCurves | ceiling ~32-45 | shell stretch vs short print
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 32.1 whole 0 turret 11.8 stations 52.6 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.61/2.6 (0.36%) hullLengthM 6.93/6.99 (0.86%) overallLengthM 10.26/10.24 (0.24%) widthM 3.4/3.4 (0%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.376 vs pub 2.60 (-8.6%), bodyLen 6.418 vs 6.99 (-8.2%)
Cap verdict: NEW quantification — proportionally undersized print; curves capped near current values while dims hold published
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.

## Zero-row triage + warp derivation (2026-08-03, soviet-heavy family agent)
Reference RENDERS (tmp-sovheavy-triage: refPx 5956, refBox [3.4,2.4,9.72],
rig 10/4 meshes) — the committed 0 row is HONEST (preview reproduces it:
wholeCurves 0). NOT a registration defect. Extract: hullMask -9.1%, bodyH
-8.3%, overall -5.2%, width 0% — print short+squat; 266-vert turret dip
interior (warp legal). Warp plan banked in tools/vertex-normalize.mjs
(object279: uniform y x1.0906 (2.384 -> 2.60), z hull x1.0999 about -1.6775,
M-65 muzzle 4.855 -> 5.067 = rear'+10.24; sim: h 2.6001, hullMask 6.990,
overall 10.252). BUILD after the batch lands — trust the extract for the
quad-track skirted saucer (owner note), not intuition.
