# Upiór IFV (`upior`) — NEW VEHICLE packet (§5.248 IFV wave)

**Exact vehicle modeled:** the Upiór — FICTIONAL Polish concept IFV; THE
PRINT IS THE DESIGN (round brief). Compact faceted stealth hull: crowned
roof chamfers, wedge bow converging to a mid-height nose edge, cut plan
corners front and rear, shallow sponson skirts over exposed narrow-gauge
running gear (six r0.235 wheels, raised front idler + rear sprocket),
BMP-2-class faceted turret rear-of-mid with a thin 30 mm and roof ATGM
tube, and the tall LEFT sensor mast behind the ring (crown ~2.55, whip
spike above), 'W-01'.

## OWNERSHIP / ROUND STATE (2026-08-17, §5.248 IFV wave)
GROUND-UP NEW ID (spec src/vehicles/afvFamily.ts, builder `buildUpior` in
src/vehicles/profiles/afvFamily.ts). The former bmp2-donor `upior_ifv`
variant is now the separate playable `bwp1` (BWP-1; owner turret
enrichment c425f495 re-applied after the §5.258 merge).

## DIMS DECISION — PRINT-PROPORTIONAL (§5.249 ASK-OWNER default)
The REG row's provisional 6.70 m length was a pre-extraction BMP-2-class
guess and is NOT print-proportional: at the banked 3.00 width anchor the
print reads L 5.11 / body 5.01 / H 2.55. Spec rides the print's own
proportions: **hullLengthM 5.01 (12%-filter body span), overallLengthM
5.11 (mask span), widthM 3.00, heightM 2.55** — the conflict inside the
REG row is REPORTED to the orchestrator (ASK-OWNER remains open).

### Instrument findings (this round, receipts in gate JSONs + probes)
1. **FBX z-handedness (ORIENTATION PIN, kept):** THREE decomposes this
   print's FBX root matrix with the mast FORWARD-of-center; the raw
   accessor parsers (vertex-extract + an independent transform-chain read)
   both put the mast REAR with the 30 mm muzzle +z. `yawOffset: Math.PI`
   pinned in the three browser maps (world-z probe receipts); the vertex
   REG keeps 0 (its parser is already in the build frame). The pin plus
   the ukraine lane's off-origin loader recenter took the gate from
   dAlong -11.2 (models unregisterable) to dAlong 0.06 (co-located).
2. **Sub-pixel stern whip:** the print's own full-height stern spike
   (2.84) AA-flickers in and out of the 96-column trace between runs; an
   authored solid whip anti-matched it whenever the ref's dropped out —
   the build carries turret radio whips only (§B3 satisfied) and the
   spike stays a documented ref-noise column.
3. **Width anchor:** run 1-5 skirts at ±1.48 made the harness inflate the
   whole build ×1.013 (dims len/height read +2.5-3.5%); skirt outer faces
   now sit at the exact ±1.50 anchor.

## Dimensions (print-proportional — no published data exists)
| Measure | Value | Notes |
|---|---|---|
| Hull length (body) | 5.01 m | print's own 12%-filter read |
| Overall (mask) | 5.11 m | gun stays behind the nose |
| Width | 3.00 m | banked anchor |
| Height | 2.55 m | mast-crown p95 datum |

## Round history (§K flow)
- MEASURE: docs/references/vertex/upior.json + gate ref columns + the
  shared-scene composites (shots/ifv-wave/upior_scene_side.png).
- r1 baseline (pre-pin): curves 0/0/0, dims 44 — unregisterable frames.
- Ladder: orientation pin, shallow skirts + exposed wheels (the run-1
  full-height skirt slab owned the whole side bottom), mast slimmed to
  the print's raked thin form then recentered/widened to the extract's
  x -0.48..+0.02 band and shifted onto the ref's -0.75..-1.27 z band,
  thin nose edge (the print's own converging tip — anchors the 5.01 body
  read), owner-c425f495 "no empty tail" rear shelf absorbed, wrap-length
  idler/sprocket trim to the print's thin track band.
- Honest residuals: hull side rows pay the mast-region shape delta and
  the wheel-arc vs the print's exposed gear; concept-print mast/turret
  AABB cohabitation noted (the print's own layout).

## Guards
No shared-resident geometry touched; additive family-module rows only.

## CLOSE (×2 bit-identical, 2026-08-17)
  min 22.2 | hull 22.9 whole 22.2 turret 41.1 stations 58.6 dims 100 floaters 100
Arc: 0/0/0-unregisterable → co-located (orientation pin + loader
recenter), dims 44 → 100 (print-proportional spec + exact width anchor +
wrap trim), stations 0 → 58.6 (§C bins), turret 0 → 41.1. Floor:
hull/whole rows carry the mast-band shape delta + the exposed-gear vs
smart-track read (honest residuals; the print IS the design).
Geometry hash 76163cf0 (60 meshes / 57099 verts).

## §5.269 FIX ROUND (critic 7.6 + REVERSED-instrument find, 2026-08-17)
PIN RE-ADJUDICATION (ordered): the critic's shaded-content receipts
(close-nose: twin-door stern + coiled tow cable on the pinned +z face)
proved the round-1 yawOffset PI pin rendered the print REAR-FORWARD — the
profile-shape bow/stern tell fails on this concept (BOTH ends converge).
Pin REMOVED from the three maps (native THREE frame is nose-+z correct);
the vertex REG carries PI instead (its raw parser mirrors this FBX); the
corrected extract is committed. NEW LOADER LAW (additive `turretYaw`
param): the artist PARKS the whole station 180° over the deck — the rig is
re-posed about the turret-shell footprint to the fleet's gun-forward rest
law before masks/dims (pivot = shell-only footprint; the whole-cluster
pivot was biased 0.5 m by the parked gun, probe receipts).
BUILD: full native-frame rebuild — tall faceted shackled BOW (+z) with
rivet field + headlight pods, converging twin-door STERN with door relief,
hinge blocks, waterjet covers and the coiled tow cable, faceted DRUM
turret (14 flats + chamfer ring, not a dome), the L-PEDESTAL sight with
the elevated ATGM tube (crown = the print's own 2.55-class p95 roof), gun
cradle mass (trunnion cheeks + recoil housing). Dims re-derived for the
gun-forward pose: 5.15 / 6.20 / 3.00 / 2.55 (the parked print hid a 1.1 m
muzzle overhang on the compact hull — both models now overhang alike).
§B4 clean after the narrow-gauge sweep (tub 0.72, corner facets vertical
inner edges at 1.155, outboard sponsons 0.93+, stern band ±0.70).
ADJUDICATED NEGATIVE: the print's two floating pedestal-flank fragments +
sub-pixel whips are its own defects — matching them cost floaters/stations
more than the 2-3 columns they buy (receipts shots/ifv-fix1/).
CLOSE (×2 bit-identical, HONEST ROW — replaces the reversed-frame score
per the fix order): min 0 | hull 4.9 whole 0 turret 8.9 stations 45.1
dims 100 floaters 100. Hash ab3f40e4 (55 meshes / 60783 verts). The low
curve rows are the residual print-vs-build shape deltas measured in the
CORRECT frame for the first time.

## HULL-FLIP ROUND (OWNER ORDER, 2026-08-17 — uncommitted lane)
ORDER (verbatim): "the upior ifv (id upior)'s hull is backwards, fix and
move its turret accordingly so it stays in same place on hull but still
faces right direction".

THE PIXEL FACT (established FIRST, §5.254 BEFORE set in
shots/upior-flip/before/): the PRINT's native +z end is the SHACKLED
CONVERGING PROW WEDGE — two D-shackles on the mid-height nose beam,
headlight pods at the glacis top corners, raked glacis (ref_close-posz) —
and its -z end is the twin-round-door stern with the coiled tow cable
(ref_close-negz); its turret+mast sit REAR-of-mid and the parked gun
stays BEHIND the nose (ref_view-top). The ab3f40e4 BUILD had those end
SHELLS swapped (flat plated face at +z, prow wedge wearing the stern
doors/cable/waterjets at -z, proc_close-posz/negz) with the turret
front-of-mid at +0.74 — the hull read backwards in the garage exactly as
the owner said. §5.269's "native-frame rebuild" was itself the mirrored
read; its own tell survived in-tree: the §5.248 armor comment still said
ring z -0.74 while the §5.269 spec pivot said +0.74.

THE FLIP (station-level re-author, no group rotation): every hull shell
station mirrored z->-z in lawful slab plan order (tub/sponsons/crown
facets/corner facet pairs/wedge frustums/nose beam/plates/chamfer — the
two §5.269 stern pieces that were authored with reversed rings, bzF<bzR,
are now outward-wound by construction); running gear mirrored (raised
front idler +2.20 / rear drive sprocket -2.10, §5.248 identity restored
in the true frame; wheelZs/rollers/contacts mirrored); skirt bins, rails,
flaps, decals mirrored. CONTENT-LAW furniture re-seated on its lawful
end: doors/jambs/hinges/cable/handle re-anchored FLAT on the new plated
stern (rake zeroed), taillights tucked to x +-0.66, waterjets kept at
their (unchanged) -z seats now exactly ON the mirrored under-stern face;
shackle plates+rings re-seated ON the nose beam (y 0.82/0.80), headlight
pods + glass onto the glacis top corners (pitch -0.98 = the glacis
rake), rivet field re-laid as 4 glacis appliqué strips pitched onto the
raked face. Deck: driver cluster UNCHANGED (already print-true bow-left);
engine riser+grate+louvers mirrored to +0.90 forward-right (the print's
rounded engine hatch at [+0.56, +0.84] — front-engine IFV, doors own the
rear); stowage cloth to -1.60, spare links to +1.78 leaning on the
glacis; rear deck riser stays -1.98 over the doors.

TURRET RE-SEAT (the "same place on hull" clause): spec turretPivot z
+0.74 -> -0.74 — the ring mirrors WITH its hull furniture so it stays
rear-of-mid over the same deck (between engine riser and door-bay riser),
gun still +z. Bonus corrections the mirror surfaces: the old +0.74 ring
overlapped the driver hatch (dist 0.55 < ring 0.88); restored seat clears
it (1.85). Muzzle now at z 2.21, INSIDE the nose — the print's own
"gun stays behind the nose" read; dims true-up: overallLengthM 6.20 ->
5.21 (the 6.20 was the mirrored front-of-mid seat's fake overhang),
hullLengthM 5.15 / widthM 3.00 / heightM 2.55 hold (gate actuals 5.16 /
2.99 / 2.57, all <=0.9%).

RECEIPTS: §B5 yaw90 unity re-proven (after/proc_yaw90_view-top.png — the
pedestal/ATGM/MG/whips/cupolas ride as one station, hull furniture
stays). TRACK-CLIP STRICT: pre-flip HEAD (worktree b70997ab) read front
0 / REAR 30 BAND VOX (rear:hullDark — the old taillights at x +-0.72
clipped the sprocket wrap lane) + shoe 154/249; post-flip reads 0/0
STRICT with shoe 220/152 (same pre-existing blind-spot class, total
403->372). Guards: marder1a3 59cb105c, bmp3 8d9d7aa3, m3a3_bradley
2c5ce78c, bmpt_terminator2 1c7d8fbc, bmp3_rok 7456de28, upior_ifv
3f16cb9a, spz_puma 73ee54e0, bmp2 8da8b75a, m2a2_bradley a41410ac all
byte-held on the same battery.

CLOSE (×2 bit-identical): min 3.4 | hull 3.4 whole 6.9 turret 57.3
stations 38.1 dims 100 floaters 100 — vs the ab3f40e4 row (min 0 | hull
3.4 whole 0 turret 0 stations 0) the flip RECOVERS whole +6.9, turret
+57.3, stations +38.1 at dAlong 0 co-location; hull's 3.4 floor is the
front-view mast-band residual (unchanged class). Geometry hash 3b176155
(55 meshes / 60771 verts — the -12 is the re-draped tow cable's own
curve tessellation).
