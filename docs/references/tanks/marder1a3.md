# Marder 1A3 (`marder1a3`) — GROUND-UP REBUILD packet (§5.248 IFV wave)

**Exact vehicle modeled:** Schützenpanzer Marder 1A3, Bundeswehr — ONE
long shallow glacis plate into the tall 2.01 hull roof, driver plate
front-LEFT with three periscopes, engine grille field RIGHT with the side
exhaust louvre, tall flat troop compartment ending in the vertical rear
RAMP (door inset, hinge drums, taillights), A3 appliqué courses + long
flank stowage boxes, segmented skirts over six wheels with FRONT drive +
REAR idler both raised (§B6), small two-man turret just ahead of mid with
the EXTERNAL MK20 carriage above its roof, MILAN on the right of the
carriage, PERI tower left, ringed commander station with periscope trio,
closed rear equipment wall + basket (owner c425f495 intent absorbed),
NATO 3-tone, 'Y-224'.

## OWNERSHIP / ROUND STATE (2026-08-17, §5.248 IFV wave)
GROUND-UP REBUILD — replaces the buildBradley-donor variant composition
under the same id (owner §5.248 order). Spec is a full row in
src/vehicles/afvFamily.ts; builder `buildMarder1A3` in
src/vehicles/profiles/afvFamily.ts.

## ORACLE STATE — `marder1a3` (FUSED / SUSPECT — PHOTOS GOVERN)
`public/models/community-candidates/marder1a3_arrafi.glb` (rip-poster
account history — suspect; LOCAL-ONLY quarantine). **FUSED PRINT**: the
registered turret node Object_6 is only the cupola + stern whips
(x -0.87..0.52); the actual turret mass is baked into the hull objects
(station tops 2.7-2.9 read hull-side in runs 1-3). Registration corrected
this round in all three maps: `componentMasks:false`
(t72m1_jaguar/type99a class) — scored hull/turret decomposition of a
fused print is dishonest; whole-view masks + dims + floaters remain the
honest instruments. An orientation-pin experiment (yawOffset PI) measured
WORSE (whole 84.8 → 82) and was reverted — the print is not mirrored.

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 6.88 m | overall = hull (MK20 never passes the bow) |
| Width | 3.38 m | over the appliqué |
| Height | 3.02 m | sight-crown datum (PERI/MILAN/carriage band authored to it) |
| Weight | 33.5 t | |

## Round history (§K flow, photos govern)
- r1 honest baseline (pre-registration-fix): hull 7.5 / whole 0 /
  turret 0 / stations 0 / dims 93.2 / floaters 0 — the fused turret
  polluted every component row.
- Registration fix (componentMasks:false): whole 84.8 → 85.4 with the
  owner-intent turret furniture absorbed; dims 93.2 (hullLengthM -1.85%:
  the print reads 6.909 vs published 6.88 and my body read is the bow
  knuckle thickening residual).
- Floater receipts: the constant-pose 466 px island was the bow light
  pair authored at Bradley height, hovering 0.45 m over the low Marder
  glacis (crop receipt shots/ifv-wave/marder1a3_floater_crop.png) —
  seated on the plate; floaters 100 from run 7.
- OWNER ABSORPTION (c425f495): the owner's sparse-turret enrichment
  targeted the old donor-clone turret (side service boxes, ringed command
  station, closed rear wall + rack). All four intents are authored into
  the ground-up turret at photo-true stations; measured whole 82 → 85.4
  across the absorb runs.
- Honest residuals: the print's turret hump sits ~0.4 aft / ~0.15 higher
  than the photo-true seat (suspect print; §B7 photos-govern) — the
  whole-row gap at the turret columns is the documented cap.

## Guards
No shared-resident geometry touched; family-module rows only.

## CLOSE (×2 bit-identical, 2026-08-17)
  min 85.3 | whole 85.3 dims 93.2 floaters 100 (hull/turret/stations
  vacated — fused print, componentMasks:false)
Arc: min 0 → 85.3 (registration truth + bow-light floater fix + owner
c425f495 turret-furniture absorption measured 82 → 85.3-85.4). Floor:
the print's fused turret hump sits ~0.4 aft of the photo-true seat
(§B7 photos-govern residual); dims -1.85% hullLengthM (bow knuckle
body-filter residual).
Geometry hash ab70b098 (59 meshes / 61383 verts).

## §5.269 FIX ROUND (critic 6.5 -> ordered fixes, 2026-08-17)
ORDERED + DONE: §B9 — the slab-to-hub skirt is dead: upper band ends 0.84
with the Marder's SCALLOPED hem (five down-pointing gap triangles) and all
six wheels fully exposed; turret rebuilt as the LOW CAST ROUND-FRONTED
casting (lathe body, every station re-seated onto the curvature) with the
external MK20 carriage above it; glacis is ONE long shallow plane
(knuckle killed) with the real folded fording vane carrying the dims
anchor; ramp relief (frame border, bigger hinge drums with end bosses,
guarded taillights, convoy plate); smoke banks re-authored on visible
collar seats. Floater receipts: the constant-pose island was the bow light
pair at Bradley height — seated on the plate (crop receipt). §B4 swept
clean (cheek wedges above the grouser run, plank raised, body bottom
1.16): track-clip 0/0/0 strict.
CLOSE (×2 bit-identical): min 85.1 | whole 85.1 dims 100 floaters 100
(hull/turret/stations vacated — fused print). Vs base: dims 93.2 -> 100,
floaters 0 -> 100, whole 85.3 -> 85.1 (−0.2, ordered §B4 body-raise; the
spz_puma −0.2 tolerance precedent). Hash 694568.

## §5.302 OWNER ORDER — hull revert, turret preserved (2026-08-17)
ORDER (verbatim): "now completely revert our marder hull while preserving
its new turret".
DONE — SPLICE: the pre-§5.286 Bradley-donor hull returns COMPLETELY
(buildBradley loft/gear/skirts/glacis/ramp/fenders + the A3 appliqué rail
course, hullDetail rail rows and bow lights of the pre-wave builder,
restored verbatim from 2fc642fb^). The wave's ground-up hull reverts with
ALL its hull-side fixes as ordered: scalloped hem, one-plane glacis +
folded fording vane, ramp frame/drums/taillights, glacis appliqué wedges,
segmented skirt band. The §5.269-fix LOW CAST ROUND-FRONTED turret
(external MK20 carriage, MILAN bracket, offset ringed commander station,
unequal service boxes, smoke collar seats, periscope trio, closed rear
wall + basket) is PRESERVED BYTE-VERBATIM in addMarderCastTurret — only
the seat moved.
RING-SEAT RECEIPT: seat rides spec armor.turretPivot = [0.18, 1.895,
-0.05] — the OLD hull's ring station (pre-wave addMarderTurret sat at
(0.18, 1.84, -0.05); 1.84 carried a 0.14-tall collar spanning 1.84..1.98).
The preserved turret's collar is local -0.02..+0.08, so y reconciles to
1.895: collar world band 1.875..1.975 = 0.030 buried under the donor roof
plate top 1.905, 0.070 reveal — the same burial class as both prior
states, and the family ring datum (pre-wave m3a3 used 1.895 on this same
roof). Sweep box receipt: turret part min y = 1.875 exactly. §B2 no-air at
the ring seam: no enclosed-island cluster anywhere in the ring band
(sweep clusters all in kit-standoff zones); side crops show the cast
skirt flowing into the roof.
SPEC (hull-side reverts, turret-side stays): dims silhouettes restored
(6.39 / 6.41 / 3.38 — the gate reproduces them at 0.07-0.08% on the
restored hull) + silhouetteHeightM 2.85 measured at today's instrument
(gate actual; the preserved turret crown on the lower donor roof);
published heightM 3.02 stays (sight-crown publication, turret-side).
Armor mirror hull envelope reverts to the m2a2-family datum the donor
hull honestly measures (hl 3.27 / hw 1.64 / inW 0.95 / floor 0.45 /
trkTop 0.95 / roofY 1.90); turret band, thickness rows, gunPivot
[0, 0.78, 0.26] and gun data stay on the wave's print-measured values.
GATE (×2 bit-identical, md5 903d7cfca8763e598fbd51f972d978c1): min 81.9 |
whole 81.9, dims 100, floaters 100 (hull/turret/stations vacated — fused
print). The wave row was 85.1 with the ground-up hull; 81.9 is the old
hull measured against the same fused print — tool-written truth, the
expected old-hull class.
HASH: 694568 (59/64365) -> 59cb105c (70 meshes / 82601 verts).
GUARDS byte-identical: bmp3_rok 7456de28, bmpt_terminator2 1c7d8fbc,
upior ab3f40e4, upior_ifv 3f16cb9a, ua_m2a3_bradley f882ab20, spz_puma
73ee54e0, bmp2 8da8b75a, m2a2_bradley a41410ac.
track-clip --exact: front 0 / rear 0. §B5 receipt: yaw-35 top view — cast
+ carriage + MILAN + rack + MG + banks rotate as one, hull static
(shots/marder-hullrevert/probe-yaw35/). §B2 sweep: whole-view worst
1382px = certified-donor class (untouched m2a2 guard sweeps 1045px);
turret-isolated 6030px is the preserved turret's own open kit
architecture (mesh rack apertures, pintle standoffs, carriage frame) —
identical geometry to the ratified §5.269 build.
EVIDENCE: §5.254 pairs shots/marder-hullrevert/before/ (at 694568) +
after/ (at 59cb105c), probe-r1, probe-yaw35.
