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
src/vehicles/afvFamily.js; builder `buildMarder1A3` in
src/vehicles/profiles/afvFamily.js.

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
