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

## §5.304 OWNER ORDER — id RETIRED from the roster (2026-08-17)
ORDER (verbatim): "keep our BMPT terminator 2, but remove the BMPT-72
Terminator 2". Roster mapping per owner ruling: the ORIGINAL clone id
`bmpt_terminator2` STAYS the roster's Terminator (byte-frozen through the
removal — hash 1c7d8fbc, 130 meshes / 109796 verts, verified before and
after); the §5.248 ground-up id `bmpt` (tankLabels 'BMPT-72 Terminator
2' / shortName 'BMPT-72') is REMOVED. This resolves the §5.269/§5.263
roster-reversal ASK-OWNER by owner ruling.
FINAL STATE AT REMOVAL: hash cd427718 (61 meshes / 70962 verts), gate row
min 5.7 blockout-print cap class (dims 100 / floaters 100), landed §5.286.
REMOVAL CHECKLIST (§5.287 wiring law in reverse — every registration):
- src/vehicles/afvFamily.js: AFV_FAMILY_IDS entry + full spec row (53
  lines) removed; header comment updated with the order.
- src/vehicles/profiles/afvFamily.js: buildBMPT + its section header (185
  lines) + AFV_FAMILY_PROFILES registry row removed (grep-verified: the
  only references were the definition and the registry row).
- src/vehicles/tier.ts: `bmpt: 9` removed (tier.selftest green without
  the id — registered-but-tierless and tiered-but-unregistered both
  covered; 114 tanks).
- src/vehicles/tankLabels.js: label block removed.
- src/vehicles/vehicleMarkings.js: anchor row removed, comment updated.
- tools/procedural-fidelity.html + tools/visual-evaluator-page.html +
  tools/tmp-tank-critic.html: REG rows removed.
- tools/vertex-extract.mjs: REG row (8 lines) removed.
- Residual `bmpt` hits in src/tools after the sweep: documentation
  comments only (this note's cross-references).
LEDGER: docs/geometry-gate/ledger.json still carries the bmpt row —
tool-written law: the ORCHESTRATOR drops it at landing (reported, not
hand-edited). docs/geometry-gate/bmpt.json and this packet STAY as
history. The print public/models/community-candidates/bmpt2_sanderwolf.glb
stays on disk as local reference material.
npm test green at the removal state (no dangling references).

## CLONE ROUND — `bmpt_terminator2` (OWNER ORDER, 2026-08-17, uncommitted lane)
(This section covers the KEPT t72b3m-donor clone `bmpt_terminator2` — the
roster's only Terminator since the ground-up `bmpt` row above was removed.)
ORDER (verbatim): "make the terminator 2 much better and have 2 shooting
holes for both its barrels (create this in code) with a super fast reload".

TWIN-BORE CAPABILITY (CORE, tankFactory.js): the fallback-bore pass used
to install exactly ONE rim/annulus/disc assembly at the muzzle anchor and
suppress authored bores — twin-gun tanks physically could not show two
mouths (the owner's screenshot: one floating center mouth between two
solid rods, receipt shots/bmpt2-round/before/proc_view-front.png). NEW
OPT-IN KNOB: `spec.gun.muzzles = [{x,y}, ...]` (recoil-local lateral
offsets at the muzzle plane) installs one assembly PER barrel tip, each
seated by the same capZ ray at its own axis. ABSENT-PARAM BYTE-IDENTICAL
(§5.279 loader-law pattern) PROVEN: sentinels leclerc e6523de8 / t64bv1
eabf99cc hashed byte-identical before and after the core edit on the same
tree, and pure-HEAD == HEAD+lane-files for leclerc/t64bv1/t72b3m/bmp3 in
the clean-room worktree (1829fcb7).

WIRING: gun.muzzles = [{x:-0.16},{x:+0.16}] (the twin 2A42 tubes' authored
axes). §B3.1 x2: both dark mouths read end-on (after/proc_view-front
crop), and both assemblies RIDE the yaw/pitch rig (§B5 receipt
after/proc_yaw90_view-top.png — one mouth per tip at yaw 90).

MUCH BETTER (the removed bmpt's §5.269 fix bar, clone-local edits only —
donor t72b3m byte-held 6d747b34): Ataka pods rebuilt from armored boxes
with buried tubes into RACK ARMS — cantilever arm rooted in the turntable
slope + hanger web + two SEPARATED tubes per flank (7 cm air gap) with
clamp collars, PROUD light-tone end caps reading side-on, recessed dark
mouth rings, rear end plates; the pano funnel read killed (square post +
box head + cap lid); casemate roof clutter authored (twin ammo feed humps
with dark lids over the trunnion, cable trunk running aft, two service
lids with latches); radio whips re-seated from the r2-class "standing on
air behind the casemate" island onto real wing shelves off the casemate
rear corners (§B5 physical-seat law); glacis ERA densified with a second
STAGGERED course up the plane (half-pitch offset, |x| <= 1.19 clear of
the wrap lanes, §B4). Hem/wheels and stern grammar ride the certified
t72b3m donor (verified in pixels).

SUPER FAST RELOAD (spec): gun.reloadS 0.34 -> 0.30 (AP/HE per-shell
reloads follow; Ataka 13.5 stays). The fleet's fastest autocannon
convention was marder1a3's 20 mm at 0.32 (bmp2/bmp3 30 mm class sits at
0.38); the twin-plant Terminator takes the ordered notch under the
fastest. npm test chain (afvBalance/tier/combatAnatomy selftests) green
end-to-end at the final state.

RECEIPTS: hash 1c7d8fbc (130/109796) -> 8f9f4bcd (133/116856 — +3 meshes
= the second bore assembly, +7060 verts = racks/collars/caps/clutter/
pano/shelves). Track-clip strict front 26 / rear 18 + shoe 16/60 —
BYTE-IDENTICAL to pure HEAD (pre-existing donor debt; the round adds ZERO
offenders). No gate row exists for the clone (t72b3m-donor, no ref
print); pixels + hashes + track-clip + selftests are the round's
receipts. §5.254 pairs shots/bmpt2-round/before/ + after/ (9 views + yaw90).
