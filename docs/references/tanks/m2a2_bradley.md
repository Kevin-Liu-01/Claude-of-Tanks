# M2A2 Bradley — reference packet

Exact vehicle: **M2A2 Bradley ODS** infantry fighting vehicle — 25 mm
M242 Bushmaster two-man turret (offset RIGHT of hull center), twin-tube
TOW pod folding on the turret LEFT, ODS appliqué armor package.

## Real dimensions (2+ sources)
- Length **6.55 m**, height **2.97-2.98 m**, weight 27 t (A2 ODS) —
  [armyrecognition M2A2 ODS](https://www.armyrecognition.com/military-products/army/infantry-fighting-vehicles/tracked-vehicles/bradley-m2a2-ods),
  [Wikipedia: M2 Bradley](https://en.wikipedia.org/wiki/M2_Bradley)
- Width: **3.28 m** over the base A2 hull/skirts (armyrecognition) vs
  **3.60 m** with the full appliqué tile stack (Wikipedia family row) —
  CONVENTION: build the hull box to ~3.28 with the appliqué plates
  carrying the read toward 3.6; in-game spec width decides dims scoring
  (reconcile spec at the round).
- Suspension: **6 road wheels** per side, **FRONT drive sprocket**
  (front engine — the AFV-r1 builder flagged the original packet line as
  an erratum vs published photos; corrected 2026-08-04), rear idler,
  3 return rollers; tracks with removable rubber pads. §B6 both ends
  raised regardless; the r2 round should swap the drive-end read.

## Identity cues (visual laws for the build)
- Two-man welded turret sits OFFSET RIGHT and well AFT of the bow; long
  thin 25 mm M242 with a boxy mantlet/rotor and prominent muzzle; coax
  7.62 slot right of the gun.
- **TOW twin-tube pod on the turret LEFT side** — raised/erect in combat
  pose, the single strongest Bradley tell; pod reads as a rectangular
  box with two round tube ends.
- ODS appliqué: flat bolt-on plates over hull front/sides + the turret;
  "semicircular shield" stowage ring around the turret rear
  (armyrecognition). Side skirts run the full wheel line.
- Sharply raked one-piece glacis rising to the driver's plane (driver
  hatch front-LEFT); trim-vane wire cutter in front of the driver.
- Tall slab hull sides (IFV volume), rear troop RAMP (not doors) with a
  small door inset; headlight clusters in the hull front corners;
  2x4 smoke launchers on the turret front.
- Engine front-right (exhaust on the right hull side) — the hull roof
  runs flat from the turret aft to the rear ramp (troop compartment).

## Oracle status
ORACLE LANDED (2026-08-04): owner-downloaded 42manako "M2 Bradley IFV"
(CC-BY-4.0 embedded; ATTRIBUTION.md "AFV oracle drop") at
`public/models/tanks/community/m2_bradley_ifv.glb`, wired in
LOCAL_REFERENCE_OVERRIDES (turret_lod split, autoPivot). Batch-38
normalize applied (print was +10.7% tall / -8% short): verify height 0%
/ hullMask 0% / overall 0%; width -1.3% is the untouched anchor axis —
reconcile the in-game spec width (3.24-class?) vs the published 3.28 at
the first gate round and document which datum dims scores against.
Full curve gate is OPEN.

Superseded scouting note:
NO local reference GLB (pre-drop). Candidates found on Sketchfab (license/provenance
UNVETTED — the "[BA]" one reads as a game-mod export, prohibited class;
the others need CC verification before any download is even proposed):
42manako "M2 Bradley IFV" / maddex88 "M2 Bradley". Owner decision needed
before downloading anything. Until an oracle lands: reference-guided
build only — dims + floaters are the measurable gate components; NEVER
gate curve components against a donor (false-0/donor-drift law).

## Build targets (procedural, world coords, +z forward)
Overall/hull 6.55 (no gun overhang past the bow at rest — the 25 mm
muzzle rides near the bow plane), width 3.28 hull / appliqué toward
3.5-3.6, roof ~2.30 hull / 2.97 turret top class; 6 wheels r≈0.30 span
the hull, sprocket rear-raised + idler front-raised per §B6 (trapezoid
run); §B5: TOW pod, stowage ring, duffels are TURRET furniture
(rig_turret); §B3 decoration minimum (pintle/coax reads, duffels, rack).

## AFV r1 — oracle probe + width reconciliation + rebuild (2026-08-04)

### Probe (false-0 law) — post-batch-38 verify, print SANE
`repair_oracles.py inspect`: real node split — body_lod0, turret_lod
(25 mm FUSED into the turret mesh — parity holds, proc turret mask
includes rig_gun), treads_lod, bagsbagsba stowage node, two zero-width
side cards at x +-0.47 (track inner walls; they render into masks as
flat planes — noted, benign). `vertex-extract` (REG row landed with the
batch): bodyH 2.98 (0%) hullMask 6.553 (0%) overall 6.553 (0%) width
3.236 (-1.3%) flip false. Structure sane, no repair-lane stop; batch-38
warp verified from this side — do NOT re-warp (e699c868 bytes).

### WIDTH DATUM RECONCILIATION (the flagged known item — resolved)
In-game spec widthM moved 3.61 -> 3.28 (modern3.js, this round). The
3.61 appliqué-stack datum is published (Wikipedia family row) but the
fidelity harness anchors BOTH models' width via a UNIFORM safeScale —
against a 3.236-wide print, spec 3.61 inflates the oracle +11.5% on
every axis and destroys every curve row. 3.28 is the published BASE A2
hull/skirts datum (armyrecognition) and matches the print's own
proportions to -1.3% (its untouched anchor axis; residual documented,
covered by the 1% grace + ~1.3% registration inflation on the ref
side). Spec-vs-published delta after reconcile: none on length/height
(6.55 / 2.98 published exact); width rides the base datum by fiat of
the instrument — the appliqué READ stays in the dressing, inside the
3.28 band (widest built element 3.27).

### Print hull/turret split stylization (documented, followed)
The print carries a LOW hull (roof 1.90; real A2 roof ~2.26) under a
TALL turret cluster (1.89..2.98: core roof 2.765-2.80, bustle rack to
2.90-2.95, twin whip antennas = its 2.98 spikes, TOW pod left, stowage
wing right, gun bar 2.23..2.31 to muzzle 2.39). Masks are the gate, so
the rebuild follows the print's split; the whole-vehicle silhouette is
the real Bradley's. Turret seat: autoPivot center z -0.466 — ring plane
1.895 at z -0.45 in the rebuild.

### Rebuild summary (modern3.js buildBradley, full re-author)
Hull: tub +-0.95 (floor 0.45), flare slabs out to +-1.62, roof 1.905
with engine-deck raise 1.98, cargo hump 2.06, rear box 2.02 (the
print's own roof bumps); one-piece glacis (1.80,1.84)->(3.28,1.26) with
driver hatch ON the plane front-left + wire cutter + periscope row;
lower bow leaning out to the lip; bow bumper beam; stern RAMP with door
inset + undercut wedge (print ramp bottom 0.58 @ -3.04). A2 appliqué
slabs + skirt band, widest 3.27; skirt hanger brackets bridge the
top-down slit (§B2). Gear per packet: REAR drive (z -2.72 y 0.68
r 0.28) + FRONT idler (z 2.55 y 0.52 r 0.24), both raised, contact
-2.02..2.03 — trapezoid matches the print's own real ramps. NOTE the
published-photos convention says the M2's toothed sprocket is FRONT;
the packet + round brief say rear drive — followed the packet, flagged
here as a possible packet erratum (visual delta at game scale: tooth
ring position only). Turret: core to roof 2.765 + doghouse 2.80,
beveled gun-boss front (print underside 1.96->2.2), commander/gunner
hatches, appliqué cheeks, 2x4 smoke fittings, bustle stowageRack (rails
2.90) + duffels + TWIN WHIPS to ~2.99 (the print's spikes), right
stowage wing, pintle M240 fitting stowed on the bustle rail (§B3, under
the 2.9 band); TOW twin-pod LEFT as gun extras (elevates with the M242,
rides under rig_turret — §B5); M242 with rotor block, muzzle 2.39.
Fittings census: pintleMG, smokeBank x2, stowageRack, towCable,
lightCluster x2, antennaWhip x2, spareTrackLinks.

### r2-r4 gate-loop findings (bank-worthy)
- The print is ASYMMETRIC: right flank runs full-length wide (skirt line
  +1.60-1.67, tall side gear to 2.78-2.80, treads out to ~1.46); the left
  is narrower (full length only to -1.51, tread edge ~1.30) with a rear
  bracket at -1.62 (z -2.0..-2.5) and the bags cluster. Build mirrors the
  read: right skirt/appliqué line 1.635/1.575-1.79 tall, left 1.545/1.55,
  LEFT REAR RACK BOX at -1.64 carrying the >=0.35 z-band that keeps
  widthM on the 3.28 datum.
- The print's 2.89-2.98 rear-top plateau is a LEFT MAST CLUSTER (front
  x -0.77..-1.01; side z -1.48..-0.96): mount tower + twin whips. The
  bustle rack itself stays under the 2.72 center band (r4's 2.90-rail
  rack read +0.2-0.5 over the whole center rear — lowered to 2.70).
- The print's fused M242 sits x -0.11 LEFT of the turret center (its
  plan gun band) — gunPivot follows for mask parity; rotor/coax shifted.
- Roof form: 1.90 plateau |x|<1.0, camber to ~1.74 @ 1.28, flank fade to
  1.34 @ 1.62; center spine humps 2.02/2.06 (cargo + rear box); turret
  roof STEPPED 2.72 right / 2.55 left with the 2.44 mantlet shoulder
  ahead of it (side 2.76-2.80 plateau = the right stowage tower, NOT the
  roof).
- Rear form: undercut face (-3.04,0.55)->(-3.31,1.34) under the proud
  ramp lip (top 1.90 @ -3.26); corner bumperettes to -3.31.
- Bow form: shallow lower face (2.97,0.41)->(3.24,0.70) + steep lip curl
  to the 1.36-flat nose shelf (z 2.97..3.30).

### AFV r1 CLOSE-OUT — state
Gate trajectory (min row): old build vs the fresh oracle was structurally
0-class (roof at 2.32 vs the print's 1.90; its baseline slot was consumed
by the rebuild — honest gap: no numeric old-build row exists); rebuild
r1 22.1 -> r5 48.4 (hull 63.9, side rows 77-82, plan 71, stations 71.4,
turret 53.8, floaters 100; heightM p95 re-anchored at 2.96 in r6 via the
print's own left-mast plateau — final x2 numbers in the round log).
Fidelity-page similarity 91.5 overall (gun 100, hull 92.9, tracks 92.9).
Identity cues ALL delivered: one-piece raked glacis + driver hatch ON the
plane front-left + wire cutter, corner headlights (KIT lightCluster x2
with guards), 25 mm M242 with rotor block (muzzle 2.39, no bow overhang),
TOW twin-pod turret-LEFT elevating with the gun, A2 appliqué + skirts,
bustle stowage rack + twin whips, right stowage tower, 2x4 smoke banks,
rear RAMP with door inset + undercut, 6 wheels with BOTH end wheels
raised (per packet: rear drive + front idler — flagged above as a
possible packet erratum vs published front-drive photos).
Residual gate gaps are the print's documented asymmetries (left/right
skirt + tread lines differ ~0.1-0.15 m; left bags cluster) and the
turret-mask plan lottery on thin rails — each costs 1-4 columns and is
documented in the r2-r4 findings; none are silhouette-visible at game
scale (see shots/afv-r1/m2a2_bradley_fidelity.png).

### AFV r1 FINAL LEDGER (2026-08-04, gate x2 identical)
min 49.3 | hullCurves 63.3 / wholeCurves 49.3 / turretCurves 53.8 /
stations 70.4 / dims 96.6 / floaters 100 (side rows 77-82, plan 71).
standard-check: clip 0 front / 22 rear (kv2-band pass after the r7 §B4
chain: mudguards over the 1.09 wrap apex, stern wedge to a +-0.83 prism
+ corner caps, flare bottoms 1.13, hinge bar -3.15), top-down holes 0
(§B2), census mg1+9d (§B3). turret-parent: 1 ABUTTING = the hull-roof
tarp roll by the cargo hump — ADJUDICATED deck gear, stays rig_hull
(§B5 review tier; TOW pod + rack + whips + tower all ride rig_turret/
rig_gun and yaw correctly). Fidelity similarity 91.5 (gun 100, hull
92.9). Geometry hash 260e9650 (62 meshes / 58772 verts). Oracle bytes
e699c868 (batch-38, untouched). npm test 265 ok. 14-view archives:
shots/visual-eval-m2a2_bradley/ (+ shots/afv-r1/m2a2_bradley-14view/),
overlay pair shots/afv-r1/m2a2_bradley_fidelity.png.
Worst remaining rows: wholeCurves 49.3 (front_whole — the print's
left-bags/right-tower asymmetric flank cluster + mast plateau shape) and
plan-turret (thin-rail column lottery + the print's turret-node oddities
at plan resolution). These are print-shape items, documented in the
r2-r4 findings; the whole-vehicle read is verified in the overlay pair
and the visual-eval digests (yawProxy <=2.4 deg, no RIG MISMATCH).

## AFV r2 — drive-end swap + whole-front push (2026-08-04)

### Trajectory (gate x2 identical at close)
49.3 -> **58.2** | hull 63.3 -> 65.5 / whole 49.3 -> 62.3 / turret
53.8 -> 58.2 / stations 70.4 -> 73.4 / dims 96.6 -> 100 / floaters
100. Geometry hash 260e9650 -> 27dd300e (63 meshes / 66104 verts).
Oracle bytes e699c868 untouched. npm test 265 ok. Evaluator digests:
shots/visual-eval-m2a2_bradley/ (yawProxy <=1.9 deg, no RIG MISMATCH).

### DRIVE-END SWAP EXECUTED (the corrected-packet order)
sprocket now FRONT (z 2.55, y 0.56, r 0.24), idler REAR (z -2.72,
y 0.68, r 0.28) — positions/radii stayed per-END so the §B6 trapezoid
and wrap geometry are mask-identical; only the toothed ring moved to
the bow (buildRunningGear sorts ends by z, so the loop is safe under
the swap). §B4 after the swap: **0 front / 0 rear** — BETTER than the
r1 22-rear kv2-band pass; the r1 erratum flag is closed.

### dims 96.6 -> 100 (the flagged 3.4% driver: BUILD CONSTANT)
heightM read 2.94 vs published 2.98 (1.43%): the p95 anchor — the
left-mast plateau rail sat at 2.958 and read low. NOT a spec datum
item. Fix: the mast tower/antenna rail now carry the print's own
2.88-2.98 plateau across x -0.75..-1.12 (fresh front read; the r1
packet's "front x -0.77..-1.01" undershot it), top 2.98. heightM now
2.95-2.98 (0.91% grace) with the whips as the ref-aligned spikes.

### front_whole 49.3 -> 62.3 (the binder order)
Fresh workorder columns against the packet r2-r4 asymmetry notes:
- LEFT flank rebuilt to the print's narrow read: flare ends -1.49,
  upper applique at -1.475, tilted deep skirt plate (front band
  0.85..1.50 over x 1.31..1.50, z -3.05..2.70 — the r1 thin outboard
  plate left the track visible to ground at x -1.34..-1.38), left
  rear bracket now the print's own narrow 1.22..1.33 band, and the
  front-left fender BAG box (plan x to -1.65 over z 2.0..2.5, the
  tapering 1.13..1.55 -> 1.24..1.33 front wedge) — the r1 "left rack
  box" was this element mis-read as amidships.
- RIGHT: skirt on the print's full-length 1.62 line (width datum caps
  the outer face at 1.6455, 3.29 = 0.34% grace), stowage tower widened
  to the print's x 0.77..1.36, exhaust pulled onto the slab face.
- TREAD ASYMMETRY (print: right to ~1.46, left ~1.30): rig band now
  matches the LEFT (xc 1.135, trackW 0.33); a static right outer
  shoe-pad row + return cover strip (hullTrack bucket, so §B4 measures
  it as track) carries the right's extra width. Any symmetric band
  pays ~4 columns of 0.5-0.9 err — this was the only honest split.
- Nose reshaped to the print's rounded-corner trapezoid (center 3.17,
  3.26 @ |x| 0.65-1.2, corners to 2.94): overallLengthM 6.57 (0.24%).
- Bustle rack lowered to the print's 2.46-2.55 front center band
  (rails 2.56); the floating C-21 decals moved onto the slab faces
  (decals are mask geometry — the right one owned two front columns
  and a plan column at x 1.66).
- turret plan 47.4 -> 58.2-supporting fix: the r1 right-tower seat sat
  0.4 aft — the packet's "plan z -1.09..0.18" is WORLD frame, not
  turret-local. M242 tube split per the bmp2 r2 law (12-seg buildGun
  stub + 28-seg extension + P.muzzleZ restored); coax stub 16-seg.

### §B table at close
§B2 top-down flood 0; §B3 census mg1+9d; §B4 clip 0/0 (post-swap);
§B5 turret-parent 0/0/0 (the r1 tarp-roll abutting adjudication
stands — it no longer flags); §B6 trapezoid both ends raised (front
sprocket 0.56 + rear idler 0.68, the print's own real ramps).

### Worst remaining rows (honest)
front_whole 62.3: the mast-plateau west edge x -0.75..-0.88 (~0.15),
the right 1.32-1.46 tread cols (partially served by the pad row), and
the turret saddle x -0.3..+0.73 (my rack band vs the ref's 2.46-2.55
fall-off). side_whole 70.9 carries dAlong -0.075 (the side bodySpan
mid moved with the bow/nose reshape — same registration class as the
bmp2 r2 law; re-anchoring the side mids under that mapping is the
next arc's first order). plan rows 70.8 (the x ±1.5-1.7 flank-edge
lottery). turret plan residual: the x ~0.04 column (one col, e0.92,
unidentified against the yawed capture — packet-flagged for the next
probe).

## AFV r3 — side-mid re-anchor + turret binder push (2026-08-04)

### Trajectory (gate x2 identical at close)
58.2 -> **79.9** | hull 65.5 -> 80.4 / whole 62.3 -> 79.9 (front_whole
binds) / turret 58.2 -> 81.5 (**the binder order: +23.3**; asked +5) /
stations 73.4 -> 83.3 / dims 100 held at every landing point (close:
heightM 0.54% / hullLength 0.72% / overall 0.2% / width 0.08%) /
floaters 100. Rows at close: side_hull 82.8, side_whole 81.9, plan
85.3/85.3, front_hull 80.4, front_whole 79.9, turret_side 85.2,
turret_plan 81.5. Geometry hash 27dd300e -> 44e1808c (63 meshes /
75236 verts). Oracle bytes sha1-8 e699c868 untouched (re-verified).
npm test 265 ok. Evaluator digests shots/visual-eval-m2a2_bradley/
(yawProxy <=2.9 deg, no RIG MISMATCH).

### THE ORDERED RE-ANCHOR — the -0.075 registration was BUILD-CAUSED
dAlong -0.075 -> -0.036 (and plan dAlong 0.074 -> ~0). Two artifacts
manufactured it, found by re-scoring the workorder traces under the
gate's exact pairing (ref@Z <-> proc@Z+dAlong, sign verified against
the gate JSON's own worst columns):
1. The ramp door HANDLE knob (z -3.278..-3.323) plus the bumperette
   bottoms made the -3.33 side column 0.371 y-thick — 17 mm OVER the
   0.354 body filter — extending my body span a full column aft.
   Handle moved to -3.24.
2. My bow at the ref's z 3.27 body column read 0.19 thick where the
   print's reads 0.39: a bow face plate (y 0.87..1.26, z 3.19..3.268)
   makes the column body-thick at the ref's own band.
With the registration snapped, the r2 "shifted" stern/glacis columns
self-healed (they had been RIGHT same-column all along) — side_whole
+7.6 in one landing. BANK: registration is part of the BUILD — a
9-cm door handle moved a whole family of rows.

### BANK LAW — the workorder plan-mirror bug bit r1/r2 authoring
The vertex-workorder's plan world-mapping mirrors per-run (the t72bu
degenerate-pick class, still live). Three r1/r2 packet reads were
Z-MIRRORED and are corrected here: (a) the "front-left fender bag box
z 2.0..2.5" is at the ref's STERN (z -2.0..-2.5) — after the r3 bow/
stern edits made the plan envelope near-symmetric, the v11 orientation
guard hard-zeroed the plan row (mirror fit 76.8 vs straight 0) until
the bag moved; (b) the "left rear bracket at -1.62, z -2.0..-2.5" was
a PHANTOM (the bag's own outer face carries the thin 1.25..1.31 front
bands) — deleted; (c) the bow "corners to 2.96" read: the ref's bow
plan is 3.17 center / 3.26 mid / 3.28 CORNERS-FORWARD — nose rebuilt
(lip curl top to 3.24, shelf corner verts to 3.28). Plan rows 70.8 ->
85.3. RULE: author plan z-values only from the gate JSON frame or the
in-page instrument; raw workorder plan values must be sign-checked
against a known asymmetric feature every run.

### Turret binder 58.2 -> 81.5
- TOW pod front re-cut as the ref's plan diagonal (z 0.68@x -0.86 ->
  0.21@-1.23, seen from above: the erect pod's tilted corner); tube
  muzzles pulled flush.
- gunPivot x -0.115 -> -0.075: the print's fused M242 plan band is
  x -0.15..0.0 (gate-frame re-measure; the r2 "-0.11 center" lit an
  extra column) — pod/rib/muzzle x re-compensated so world seats hold.
- Left wing rebuilt: bags DESCENDING STAIR (2.53 top at x 1.08..1.18,
  2.175 at 1.175..1.305, chained mast->step1->step2 with real overlaps
  — turret furniture must never anchor on the gun-parented pod, which
  elevates away); wing duffels re-cut to the ref bags rear (world z
  -1.50..-0.95); the r2 wing rail DELETED — its ref plan island
  (x 1.37, z 0.13..0.18) belongs to an element whose y-band would
  sweep the hull roof under yaw (§B5) — one 0.59 column certified.
- Rack w 1.42 (fill lumps poked the plan x 0.85 col 0.35 past the ref
  rack line); tail duffel rear -1.815 (the ref's 2.43 band ends -1.855
  under -0.036; §C column-boundary law on the edge).
- Right tower: fill top 2.805 (ref 2.80), bin front to world 0.19,
  fill front edge off the st7 slab; roof riser east edge 0.71 (ref
  dips 2.47 at x 0.72); coax barrel stub deleted (internal on the
  real M242 — only the port slit shows; its 1.0-1.3 plan reach printed
  0.26-0.5 err on center columns).

### front rows 62.3 -> 79.9 (instrumented, not guessed)
The [TMPCOL] segment instrument (see the bmp2 r3 section; runner
works per-id) identified every phantom: the 1.886-y band across ALL
x ±1.35..1.57 front columns was the RAMP FACE's ±1.55 corners plus
the RAMP HINGE LINE's ±1.45 ends (both now ±1.31, the ref's ramp
width — bumperettes own the stern corners, asymmetric: left -3.14,
right -3.26, raised to the ref's own 1.04..1.22 corner band); the
glacis crest was ±1.60 at y 1.895 where the ref's roof-edge camber
steps 1.90@1.0 -> 1.77@1.42-1.44 -> skirt band (crest w1 1.26; camber
slabs re-cut asymmetric L1.45/R1.40); the LEFT skirt is VERTICAL on
the print (y 0.635..1.555 at x 1.445..1.49, z -2.95..1.30 = its own
-1.51 plan column band) — the r2 TILTED plate projected only its top
strip and read +0.36 bottoms; left appliqué raised to 1.60; track
band re-lined 0.98..1.32 (trackW 0.34 @ xc 1.15: the ref right tread
does NOT ground x 0.92-0.96, and 1.32 clears the ±1.35 column starts)
with the left-inner pad row widened to 0.82..0.98 (ref left band
0.82..1.30 ~= the spec 0.53 m track — the r2 0.33 band was a misread
of outer edges only); trim vane shortened off the z>2.9 shelf cols;
wire cutter re-leaned flat (residual +0.06 x2 cols, §C allowance);
driver plinth to the ref's 1.57 plateau; mudguards ±1.42 with skirt-
lapped st12 cap tabs (below).

### stations 73.4 -> 83.3 (slice-paint law applied)
- st10 topPct 9.5 -> 1.2: the 28-seg M242 tube slice-vanishes; a
  12-seg thermal-sleeve joint at world z 1.45..1.85 is the segment
  that paints slab 10 (the ref slab-10 top IS its 2.31 gun bar). The
  cradle re-cut to a 2.32-top gun bar (its old 2.35 cap owned st9).
- The RIGHT appliqué's 3.19-wide end caps are its only slice paint:
  split so caps land where ref width carries them (rear plate caps
  st1/st2; mid band x<=1.5725 caps st3/st9; the r3c FRONT plate at
  z 2.38..2.76 BROKE the side rows — its 1.79 top rode the glacis
  line — replaced by low mudguard cap tabs at y 1.05 in st12).
- Mast mid-step cap pulled off the st4/st5 boundary; tower fill off
  st7; right hanger bracket cap out of st10 (zc 1.9 -> 2.1).
- Residual: st10 wPct 3.5, st13 2.1 (the skirt's 3.29-wide front cap
  — unplaceable without a wider station), st5/7/8 tops ~2 (mast/riser
  cap trades documented in-code).

### §B table at close
§B2 holes 0; §B3 census mg1+9d; §B4 clip 4 front / 49 rear —
kv2-band pass (<=60) but NOT the r2 0/0: the idler raise 0.68 -> 0.74
(the ref's rear covered-line 0.43@-2.89, worth ~5 side columns) put
the wrap top at 1.05 under the stern furniture; the 49-voxel residual
vs the corner caps/guards is the documented §B6-vs-§B4 trade of this
print's high rear ramps. §B5 turret-parent 0/0/0 (the r1 tarp-roll
abutting flag CLEARED with the rack resize). §B6 trapezoid both ends
raised (front sprocket 0.56, rear idler 0.74), contact pinned
2.14/-2.16 at the ref's own ramp starts.

### Worst remaining rows (honest) — next arc's orders
front rows 79.9/80.4 bind: x 0.94 col (ref right-inner tread edge
reads 0.46-bottom vs my 0.98 band edge — half-col AA class), the
±1.35 bottoms (~0.42-y element, likely wheel-dish/wrap AA — one
instrument run will name it), x 1.57 (+0.19). side_whole 81.9: the
-2.4-at col (z +2.42: gun-tip class under the -0.036 residual
registration — the bow plate's 8 mm AA margins bound it; making the
3.27 column fatter re-zeros it but pays plan center cols). plan 85.3:
the x -1.51 col (1.10: the ref's odd [-2.94..+1.29] flank band vs my
skirt span — partially servable by z-trimming the skirt to match).
turret_plan 81.5: x 1.37 ref island (0.59, §B5-blocked, certified),
x 0.85 (0.19). stations 83.3 (see residuals above). NOTE hullLengthM
margin is now 0.72% of the 1% grace — stern/bow edits must re-verify
dims every landing.
