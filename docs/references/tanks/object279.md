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
