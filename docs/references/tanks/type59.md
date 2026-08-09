# Type 59 — reference packet (NEW BUILD, §5.45 no-builder queue → russia lane 2026-08-08)

Exact vehicle: **Type 59 (WZ-120)** — the licensed T-54A: T-54A silhouette
with the hemispherical dome turret, 100 mm Type 59 gun (D-10T2S line) with
the bore evacuator at the muzzle-third, 5 spoked roadwheels with the T-54
gap pattern (big 1st-2nd gap), flat glacis with splash board, and the
Chinese tells the print carries (Type 69 IR/headlight cluster ON the glacis,
fender lines). §5.45 donor ruling: t54-class (the print is the author's
**Type 69** — same WZ-120 hull family, packet-documented). Grammar donor:
buildT54/buildT62MV1 lineage (loftHull + meshDome + ru* kit); **the print
governs proportions**.

## Published dimensions (2+ sources, scout packet docs/references/tanks/scout-gen2-type59.md)

| dimension | value | sources |
|---|---|---|
| overall (gun fwd) | **9.00 m** | tank-afv.com/coldwar/China/Type-59.php; militaryfactory.com armor_id=52 |
| hull length | **6.04 m** | both scout sources |
| width | **3.27 m** | both scout sources (print measures 3.269 width-true) |
| height | **2.59 m** | both scout sources; §5.73 P95-envelope datum = the cupola crown band (print's own 2.55-2.63) |

Dims verification verdict (m48 two-source precedent): all four rows
two-source published and print-corroborated (print body 6.055 = +0.25%,
overall 8.798 = −2.2% short-tube, width 3.269 = 0%, body-top 2.546 = −1.7%).
**NO spec corrections needed.** The print being a Type 69 is measurement-
consistent: its body length lands ON the Type 59 row.

## Print oracle
`/models/tanks/community/type69_lasttriarius.glb` (LastTriarius "Type 69
2.0", thing:6192142, **CC BY 4.0** — ATTRIBUTION.md; shipped in every
build). Registered in MODEL_SOURCE (userdrops7.js) as `type59` until this
round's flip; at the flip the id renders buildType59 everywhere, the print
retires to candidateGlb (kv2/t30 pattern → Sources print card automatic)
and measurement registration moves to the three override maps (§10-pattern
mirror, helper-expanded `glb()` config verbatim).

Fused shell: HullMesh + Turret>TurretMesh, gun baked into the turret node.
Extract: docs/references/vertex/type59.json (2026-08-03, gate-parity
raster; glbToGate ×0.092329 uniform, identity axes, offset z −1.326).
**Frame landmark-verified: +z = front — glacisSign +1, gunSign +1,
turretSeatSign +1, agree:true.** AFT-SHIFTED frame: body (12%-band)
z −4.266..+1.789 (6.055 m), hull mask −4.399..+1.744, width 3.269, body
top p95 2.546 (max 2.628 cupola), overall 8.798 (tube ends +4.42).
turretPivot (0.002, 0.557, −0.712).

## Vertex-measured build lines (extract decode, authored DIRECTLY in the
## aft-shifted extract frame — built to the ref body ends, +0.25% of pub)

HULL:
- Stern: full-width upper box −4.09..−4.26 (y 0.72..1.30) = the hullLengthM
  rear anchor; THIN center gearbox tail to −4.398 (band 0.20 stays under the
  12% body filter — the print's own class) = the overallLengthM rear datum.
- Rising engine deck 1.32→1.468 over −3.92..−2.85; stowed OPVT snorkel ridge
  1.62 @ −3.80..−3.89 (w ±0.75, ref front-view 1.625 band); mid deck 1.364
  (1.33-1.38 jitter); splash board 1.428 @ +0.04; glacis knee (0.63, 1.35) →
  center toe (**1.56**, 1.00) — the +1.74-1.79 front line is carried by the
  FENDER/FLAP row (|x| 0.92..1.63, plan front 1.753), never the hull loft
  (r2 lesson: a 1.77 center toe read +0.22 on every plan center column).
- Type 69 IR/headlight pods ON the glacis (tops 1.439 over 0.84..1.09 — the
  Chinese identity tell): big IR drum right + white-light pair left.
- Fenders ±1.635 = the widthM carrier (full shelf at the 1.13-1.145 line,
  segmented); raised side-wall course 1.39 at x 1.49..1.54 (SOLID walls on
  the shelf, §B2); bins INBOARD of x 1.48 (ref tops 1.449-1.47); fender
  stay-brackets hang to 0.58 at the rail (ref front-view band).
- Belly plate 0.42 (front-view center bot 0.425, §B2 channel law).
- Gear: ground run −2.90..+0.55; 5 × r 0.405 spoked wheels at the T-54 GAP
  pattern z [0.52, −0.42, −1.26, −2.10, −2.94] (gaps 0.94/0.84³); track band
  x 1.045..1.425 (ref ground cols ±1.05..1.43 — the print under-scales its
  track width; mask governs); rear-drive sprocket (−3.78, 0.68, r 0.24),
  idler (1.24, 0.58, r 0.22) — the print FADES both end wraps (t62mv1
  print-fade class: real gear kept per §B6, residual certified).
- Muzzle +4.602 pinned to 9.00 overall from the −4.398 tail tip (m48
  rear-datum law; print tube ends +4.42: ~3 cols ONLY-PROC, dims sovereign).

TURRET (WIDE squat turtle — THIS PRINT's casting is 2.9 m wide; ring/pivot
z −0.71, turretG y 1.30):
- Plan ellipse −2.45..+0.61 (verified at x 1.008 → z +0.18..−2.02 vs ref
  +0.30..−2.08); skirt flare max ±1.475 @ y 1.52 (the ±1.47 plan column);
  hem 1.284 overhanging the deck; wall shelf 1.955 flat over x 1.0..1.27
  (ref front_turret); shoulder 2.18 @ ±0.75; apex 2.34.
- Cast nose BROW over the mantlet (ref side band 2.10-2.17 to +0.75): nose
  lathe with the bottom ring buried under the dome skin / into the gun
  collar (§B2 no open rim).
- Cupola LEFT crown 2.615 (ref 2.62-2.63 band @ −1.05..−0.75) = the heightM
  2.59 p95 carrier (§5.73 law; r2 receipt: a 2.535 crown read p95 2.53);
  loader dome RIGHT 2.46; mushroom VENTILATOR dome forward-center + twin
  periscope heads (the ref's 2.46-2.53 roof band over −0.15..+0.30).
- Curved rear stowage rack −1.90..−2.44 (y 1.40..1.80, chamfered plan
  corners following the dome tail).
- Turret-node APRON bottoming 0.545 over −1.42..+0.02 (fender bins baked
  into the print's turret node): hidden turretDark carriers, plan-tapered
  like the ref (±1.44 aft of −0.63 → ±1.26 → ±1.13 forward), §C mid-seam
  splits (r2 lesson: a full-width slab poked the ±1.37 plan column +0.10).
- Leaning whip antenna, turret LEFT flank (the ref's front-view 2.5-class
  tops across x −0.94..−1.34; strongly swept, spike-budget legal).
- Type 54 12.7 mm AA MG at the loader ring (MG law; kept under the 2.59
  court — r1 receipt: a y 1.16 seat read heightM 2.80/+8%).
- Gun: 100 mm — axis 1.589 (ref band 1.471..1.706, r 0.118), pivot world
  +0.15, collar + boot, **BORE EVACUATOR r 0.157 @ +3.55..+4.10** (the
  muzzle-third, the identity tell), muzzleBore §B3.1.

## Round log (measure → loft → close → prove)

HONEST BASELINE ×1 (pre-build, t62mv1 variantOf fallback vs the print):
min 0 — hull 14.8 / whole 0 / turret 0 / stations 25 / dims 0 / floaters 100.

r1 (first buildType59): min 6.1 — hull 58 / whole 6.1 / turret 46 / stations
67.1 / dims 38.6 / floaters 100. Receipts: the front_whole killer was the
UNBUILT wide flare/apron band (ref turret content to ±1.47 with the 1.80
shelf at x 1.28..1.45 — the r2 wide-turtle re-loft); heightM 2.80 (MG seat);
overall 9.15 (muzzle datum must pin from the −4.398 tail tip, not the body).

r2: min 0 — hull 60.8 / whole 46.6 / turret 51 / stations 74.8 / dims 88.6 /
**floaters 0** (the widened far-side front flap separated in 4/5 poses —
only a 0.02 shelf-corner touch; §B2 struts land in r3). heightM 2.53 (cupola
crown mis-seated 2.535).

r3: cupola crown 2.615 + vent dome/periscopes + flare 1.475 + apron taper +
flap struts + gear tuck (idler z 1.24, sprocket raised y 0.68) + track band
1.045..1.425. (Scores in the close table below.)
