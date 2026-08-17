# BMPT-72 Terminator 2 (`bmpt`) — NEW VEHICLE packet (§5.248 IFV wave)

**Exact vehicle modeled:** BMPT-72 "Terminator 2", the UVZ tank-support
vehicle on the T-72 hull — long shallow one-plane glacis with splash rails
and ERA field, full-length armored skirts with forward ERA course, six
T-72-class wheels + REAR drive, unmanned overwatch station with the twin
2A42 30 mm plant, four Ataka tubes in two armored flank pods, bow AG-17
barbettes on the glacis corners, sight mast to the published 3.17 crown,
rear transmission deck with stowage drum, '527'.

## OWNERSHIP / ROUND STATE (2026-08-17, §5.248 IFV wave)
GROUND-UP NEW ID (spec in src/vehicles/afvFamily.js, builder `buildBMPT`
in src/vehicles/profiles/afvFamily.js). NO donor geometry — the T-72
character is authored from the print's mapped lines. The t72b3m-donor
`bmpt_terminator2` variant remains a separate playable.

## ORACLE STATE — REGISTERED `bmpt`
`public/models/community-candidates/bmpt2_sanderwolf.glb` (LOCAL-ONLY
quarantine). **FUSED BLOCKOUT — silhouette reference** (per the §5.248
round brief): the twin tubes are stubs inside a hull-side object, the
turret node Object_6 is a coarse cluster.

### Instrument findings (this round)
1. **Orientation pin experiment (receipts: gate runs 3/4):** the run-2
   whole-row work orders read the print's tall mast forward-of-mid, the
   upior FBX-mirror class was suspected, and `yawOffset: Math.PI` was
   pinned in the three maps — the pin CRATERED the hull rows (58.3 → 0),
   proving the print is NOT mirrored. Pin reverted (hull returned 58.3);
   the print genuinely carries its mast/sight cluster forward-of-mid while
   the vertex extract reads it aft — the extract/THREE discrepancy for
   this file is documented as an open instrument question; the GATE frame
   (THREE) is the scoring truth.
2. **Sight-layout adjudication (three measured configurations):**
   rear-left mast (extract frame): turret 8.4 / whole 30-31; r3 side-swap:
   5.2 / 21; r5 front-right: 2.6 / 18. The rear-left layout is the
   measured optimum and ships; the residual against the fused blockout is
   the documented cap.
3. **Floater receipts:** run-1 island = rear mud flaps authored 0.13
   behind every surface (fixed to the tub rear); run-2 yaw-90 island =
   radio whips standing on air behind the casemate (re-seated on the roof
   plate). Floaters 100 from run 4.

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 6.95 m | T-72 class |
| Overall | 7.20 m | thin rear drum/flap + front dozer-lug overhangs carry the datum outside the 12% body filter |
| Width | 3.59 m | |
| Height | 3.17 m | sight-crown datum (mast head + pano band authored to it) |
| Weight | 44 t | |

## Round history (§K flow)
- MEASURE: docs/references/vertex/bmpt.json; lines mapped x0.9384 (z) /
  x0.9334 (y) into the published envelope.
- r1 baseline: hull 58.3 / whole 31.6 / turret 7.1 / stations 22.2 /
  dims 100 / floaters 0.
- Ladder: flap+whip floater fixes (floaters 100), sight-layout
  adjudication (above), glacis ERA field, skirt courses, AG-17 barbettes,
  twin-tube plant with explicit per-tube muzzle bores.
- Honest residuals: turret/whole rows are CAPPED by the fused blockout
  (stub tubes, coarse station) — the authored full-length 2A42 tubes and
  the real Ataka pod geometry are deliberate photo-true content the print
  lacks; stations pay the print's fused skirt/hull banding.

## Guards
No shared-resident geometry touched; spec/builder are additive rows in the
family module.

## CLOSE (×2 bit-identical, 2026-08-17)
  min 5.7 | hull 58.3 whole 25.3 turret 5.7 stations 17.8 dims 100 floaters 100
Arc: floaters 0 → 100 (flap + whip seats), dims 100 held, sight-layout
adjudicated across three measured configurations (packet). Floor:
turret/whole/stations are the documented FUSED-BLOCKOUT caps (stub
tubes, coarse cluster, fused skirt banding) — silhouette-reference print
per the round brief; §E posed/split repair is the unlock.
Geometry hash 2a697153 (60 meshes / 74478 verts).

## §E STOPPED — split premise disproven by census (2026-08-17, §5.248 §E
## round; print PRISTINE, sha 790b9a43…, no recipe landed)
The §5.263 "blockout split" line has no executable surgery in the real
bytes (full-cluster census per §5.66, real vertex scans):
1. NO hull-side station/tube content exists: all five hull objects
   (Object_2/3/4/5/7) top out at gate 1.92 (raw 2.61) — the only content
   above the turret base plane anywhere is Object_6 itself. The brief's
   "twin tubes are stubs inside a hull-side object" does not survive the
   scan (the 808 Object_4 fragments above raw 2.16 are |x| 1.5-2.3
   fender-band bits, not tubes).
2. Object_6 (the registered turret node) ALREADY owns the entire station
   cluster — as 3276 disconnected 4-vert quad shreds (blockout soup, no
   coherent sub-objects to re-partition).
3. The turret-row deficit is ABSENT geometry: gate work order reads
   procBot -2.8 (the authored full-length 2A42 tubes) vs refBot -1.21/-1.8
   + cover 22.6/4.0 — the print simply has no tube geometry to move
   (§5.263's own close text: "content the print lacks"). §E surgery
   cannot synthesize absent content.
VERDICT: the blockout caps stand as certified; the row's floor is the
print, not mask ownership. Any future §E action here would need a new
plan class (e.g., certify permanently).

## §5.269 FIX ROUND (critic 7.0 -> ordered fixes, 2026-08-17)
ORDERED + DONE: §B9 skirts raised to 0.76 — the six T-72 wheels read below
the hem; station dropped a full head (casemate roof 2.55 -> 2.36 world)
with real roof clutter (feed humps, cable trunk, lids); the twin-funnel
mast read killed (slim stalk + flat panel head at the published 3.17 crown;
pano = square post + box head); Ataka launchers rebuilt as RACK ARMS
carrying two SEPARATED tubes per flank with PROUD light-tone end caps
reading side-on; glacis ERA rebuilt as the dense staggered Kontakt brick
field. §B4 swept clean across five iterations (skirt bins outboard of the
track pins, glacis center-narrow + side wings above the wrap crest, AG-17
barbettes onto the wings — the five-audit stubborn 54 vox — flaps to the
tub rear, ERA brick columns clamped, fender planks above the grouser
sweep): track-clip 0/0/0 strict.
CLOSE (×2 bit-identical): min 8.2 | hull 53 whole 25.3 turret 8.2
stations 20.6 dims 100 floaters 100. Vs base (58.3/25.3/5.7/17.8/100/100):
turret +2.5, stations +2.8, whole =, dims/floaters =; hull −5.3 is the
ORDERED cost — the blockout print carries hub-deep fused skirts and the
tall station the critic ordered away (§B7 class: critic/owner law outranks
oracle matching; residual certified here). Hash cd427718.
