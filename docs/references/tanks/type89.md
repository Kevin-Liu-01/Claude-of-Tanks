# Type 89 IFV (`type89`) — NEW VEHICLE packet (AFV lane, PHOTO CLASS)

**Exact vehicle modeled:** Mitsubishi Type 89 IFV (89式装甲戦闘車), JGSDF
fit — boxy welded hull under the LONG one-piece sloped glacis (nearly half
the vehicle), driver front-RIGHT on the plane, engine louvres front-LEFT,
two-man turret seated CENTER-RIGHT with the 35 mm Oerlikon KDE (thick
stepped tube + flared conical flash hider) and the identity tell — Type 79
Jyu-MAT missile boxes on BOTH turret flanks; 6 roadwheels, firing ports
along the hull rear sides, thin skirts, Sumitomo M2 12.7 at the commander,
JGSDF 2-tone, '1071'.

## OWNERSHIP / ROUND STATE (2026-08-06, AFV lane r1)
Builder `buildType89` + spec row live in **src/vehicles/modern3.js**
(AFV lane, single owner); registered in MODERN3_BUILDERS + MODERN3_IDS;
MODEL_SOURCE procedural → garage CUSTOM tab. Owner order 2026-08-06:
"use the bradley on puma and this type 89 ifv" — bradley recipe base.

## ORACLE STATE — NONE (REFUSED; **FALSE-0 LAW: never gate this id**)
The dropped `type_89_ifv_war_thunder.glb` was a commercial-game
extraction (embedded "Type 89 IFV (War Thunder)") — REFUSED under THE
ONE ABSOLUTE RULE and DELETED at the provenance triage (28bf608); the
Sketchfab CC-BY tag cannot license Gaijin's model. This build is PHOTO
CLASS: bar = published dims + §B battery + 14-view self-reads
(tools/tmp-ww2-photoclass rig). A properly-licensed community oracle is
welcome (§E re-source lane open; check the 42manako catalog first).

## Corroborated dimensions (photo-class targets)
| Measure | Value | Sources (2+) |
|---|---|---|
| Hull length | 6.8 m | Wikipedia Type 89 IFV, JGSDF references |
| Overall length | 7.3 m | the KDE muzzle overhangs the bow ~0.5 m (photos) |
| Width | 3.2 m | Wikipedia, tanks-encyclopedia |
| Height | 2.5 m | Wikipedia (roof cluster line) |
| Weight | 26.5 t; 600 hp; crew 3+7 | Wikipedia |
Spec dims (modern3.js): 6.8 / 7.3 / 3.2 / 2.5 — dims sovereign.

## r1 BUILD (2026-08-06) — authored inventory
- HULL: tub ±0.95 (3cm inboard of the 0.98 band face — §B2
  HOLES-NOT-CHANNELS), upper body ±1.45, deck 1.78; §B1 ONE-plane LONG
  glacis (0.30,1.78) → (3.28,1.00) with the break course at the deck
  edge, nose lip curl, body-thick bow face plate (3.36..3.42), lower
  bow inter-track ±0.95 (§B4: sprocket wrap reaches z 3.09 at the
  band); glacis corner facets carry the rake over the wraps (bottoms
  1.27 vs the 1.21 apex); stern near-vertical face + power door panel
  (leaf outline + handle + hinge stacks) + corner bins with lid seams
  + latches + taillights + tow eyes.
- Driver front-RIGHT ON the plane (plinth + dark lid + 3 periscopes);
  engine louvre bank front-LEFT recessed in a raised frame (5 slats ON
  the plane); exhaust cowl LEFT flank + ribs + soot; splash rail V.
- FIRING PORTS: 3/side along the rear flanks — dark ball port +
  vision block + glass (identity cue).
- Width anchor ±1.60 (§D): fender planks (full-length z-band = the
  widthM carrier) + 4 segmented outer rail chunks/side (§C ≤0.48 end
  caps); 6 skirt panels/side + seams + hangers; mudflaps.
- GEAR (§B6): 6 wheels r 0.32 y 0.40 evenly at ±2.05..; front sprocket
  {2.62, 0.55, 0.28} + rear idler {-2.62, 0.52, 0.26} both raised;
  xc 1.18 / trackW 0.40, topY 0.92, coveredTop.
- TURRET CENTER-RIGHT (pivot [0.25, 1.80, -0.10]): welded box with
  raked FACE plate + symmetric cheek returns (§B1.1), roof chamfer,
  bustle stub; **Jyu-MAT boxes BOTH flanks** (single-tube armored box
  on wall bracket + strut, tilted 8°, dark muzzle-door recess + round
  tube mouth + rear cap rib); commander cupola RIGHT (ring + lid +
  torus + 4-periscope arc) + gunner sight hood LEFT (hood + dark
  aperture + glass = the 2.50 heightM anchor cluster) + flush gunner
  hatch; roof grab rails; smoke banks 3+3 rear corners; bustle basket
  (rails + posts + mesh + 2 stowage bundles); turret whip + hull whip.
- MG (§H.4 NATIONAL GRAMMAR): Sumitomo M2HB class — FITTINGS.pintleMG
  **cls 'm2'**, two-tone (sky-backed), on the cupola ring.
- GUN (§B3.1 + MUZZLE BORE): cast trunnion collar + dark recess ON the
  raked face; stepped tube (root 0.058 sleeve → 0.044 bare) THICKER
  than the puma's MK30; flared conical flash hider (camo-painted per
  the r5 brake law) + dark vent rings; **bore stack at face 3.45**
  (tapered open wall continuing the cone + recess funnel + dark disc
  r 0.025 inset 3.4 cm); muzzle world 3.90 = overall 7.3 ✓. Coax Type
  74 port LEFT of the gun (dark ring + stub).
- §B3.2 KIT (census mg1+10d): towCable, lightCluster ×2 + guard
  hoods, wing mirrors on stalks (heads ≤|x| 1.44 — inside the anchor,
  fv510 lesson), jerryCans (water cans rear-left), stowageRack (rear
  deck, loaded), antennaWhip ×2, spareTrackLinks (glacis), shovelTool,
  stowage rolls, lift eyes, '1071' plates + soot.

## §B battery (2026-08-06)
- §B4 track-clip --exact: **0/0 band + 0/0 shoe** ✓
- §B2 flood: **0** ✓ | census **mg1+10d** ✓
- §B5 turret-parent: 0 stranded / 0 dangling / 1 abutting = the deck
  tow cable (y 1.72-1.86 UNDER the 1.90 basket bottom — no sweep
  contact; adjudicated deck gear, bradley tarp precedent). Yaw-90 pair:
  shots/afv-r1/type89-r1-yaw90/.
- §B6 trapezoid ✓ (both end wheels raised). npm test 526 green.
- Geometry hash **2ace701c** (63 meshes / 52072 verts).

## 14-view SELF-READ (2026-08-06, shots/afv-r1/type89-r1/)
Floor **~8.5** (photo class): front 8.7 (twin Jyu-MAT wings + coax +
mirrors + M2), heroes 8.7 (the long-glacis identity is unmistakable),
left/right 8.6 (ports + cowl + skirt rhythm + §B6 read), rear 8.5
(door + bins + kit; center plain = the real vehicle), close-front 8.6
(bore + hider + recess read), top/roof 8.6 (flood-0 witnessed).
§H.4 acid: long glacis + winged missile boxes + thick 35 with flared
hider + M2 — confusable with NOTHING in the IFV set (bradley steep
short glacis/TOW-left; puma robot turret; bmp2 boat+cone; fv510
strakes).

## Residuals / next-arc candidates (honest)
1. NO ORACLE — §E re-source lane open; never gate meanwhile.
2. Mid-hull flank between ports and cowl reads plain (matches photos;
   candidate for JGSDF stencil decals if a critic asks).
3. Jyu-MAT box faces could take a §B3.2 cable conduit + latch detail
   pass at close range.
4. Icons = orchestrator lane.

## Law notes for the bank
1. National-grammar 'm2' trim on a Japanese mark confirmed per the
   §H.4 corollary (Sumitomo M2HB class) — the brief's ruling applied.
2. Tapered muzzleBore rearR variant: flash-hider cones continue
   through the open wall by passing rearR = the body's front radius
   (this build is the exemplar).
