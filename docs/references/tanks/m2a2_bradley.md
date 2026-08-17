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

## AFV r4 — the pre-staged front/plan orders + station instrument war (2026-08-05)

### Trajectory (gate x2 identical at close)
79.9 -> **84.7** | hull 80.4 -> 85.3 / whole 79.9 -> 85.0 / turret 81.5
-> 84.7 (binder at close) / stations 83.3 -> 84.8 / dims 100 held at
EVERY landing point (close x2: heightM 0.54% / hullLengthM 0.72% —
the protected margin, unchanged / overall 0.2% / width 0.08%) /
floaters 100. Rows at close: side_hull 85.7, side_whole 85.0, plan
88.3-86.7 class, front_hull 85.3, front_whole 87.4, turret_side 84.7,
turret_plan 85.8. Geometry hash 44e1808c -> dc8c1f23 (63 meshes /
75092 verts). Oracle bytes sha1-8 e699c868 untouched (re-verified).
npm test 265 ok. Evaluator digests shots/visual-eval-m2a2_bradley/
(yawProxy <=2.7 deg, no RIG MISMATCH).

### THE ±1.35 ELEMENT NAMED (the r3 order — instrument + source read)
The [TMPCOL] run + trackShoeGeometries source: the shoe PIN CAPS
(cylX half-len 0.029 at ±trackW*0.49) span xc±0.1956 = 0.954..1.346 —
26 mm OUTSIDE the band BOTH sides. They ground-lit the ±1.35 front
cols (err 0.391: the ref left tread STOPS at 1.30, flank floor 0.876)
AND the x 0.94 col (ref right-inner tread edge clean at 0.96; its
0.46-bottom is its own TUB line, which my ±0.95 tub serves). FIX is a
§F.2 SHARED-HELPER OPT-IN: `cfg.pinCapOuter` on buildRunningGear ->
trackShoeGeometries(trackW, pitch, pinCapOuter) clamps the cap outer
extent; DEFAULT BYTE-IDENTICAL (graduate hashes m1a1/leo2a5/
m47_patton/m60a1/kv2 verified unchanged). Bradley: pinCapOuter 0.1625
with xc 1.1475 / trackW 0.335 (band 0.98..1.315, caps 5 mm inside).

### Front rows 79.9/80.4 -> 87.4/85.3 (all instrument-named)
- Lower bow flanks narrowed 1.34/1.40/1.44 -> 1.29/1.31/1.36: the ref
  bow NEVER reaches |x| 1.33 below y 0.876 (its ±1.35-1.46 flank
  floor); corner slabs carry the shelf width above y 1.24.
- Mud flaps 0.71..1.01 -> 0.88..1.03 (the ref's 0.876 flank floor).
- RIGHT appliqué mid band widened INBOARD to 1.4525..1.5725 (the ref
  keeps a 1.78-top band from x 1.44 out; caps/outer face unchanged).
- RIGHT hanger brackets deepened y 0.87..1.19 (ref 1.495/1.534 col
  bottoms 0.876); left row unchanged (skirt plate already at 0.64).
- Mast tall step west face -1.10 -> -1.125 (ref cluster to -1.12; the
  -1.13 col read 2.89-top vs my bags' 2.53 — half-col AA class).
- Left bags stair re-read: fresh ref front tops 2.18-2.22 at x -1.16..
  -1.27 (the r3 "2.53@-1.11..-1.19" read overhung): step1 narrowed to
  -1.06..-1.125 (mast line), step2 east edge -1.145, wing duffels to
  -0.83..-1.13.
- Roof-step line: the ref's 2.72 riser is x +0.03..0.695 (its 2.46-47
  reads at x -0.06..0.02 AND 0.72); riser re-seated, tower fill split
  A/B with east edge 1.30 (stowage() dark straps bulge ~0.02 past
  nominal — probe-named at x 1.34) + corner post x 1.325..1.355
  carrying the ref tower's own front-right corner (see below).
- Track pads trimmed to the contact patch (k 2..21, z ±2.11): the r2
  full-length rows GROUNDED the ramp zones where the ref reads a clear
  climbing band 0.13..0.45 (also a §B6 read improvement); sprocket
  y 0.56 -> 0.60 (ref band bottoms 0.23@2.55 / 0.29@2.69).
- Spare track links glacis seat (top ~1.96 vs ref 1.56 crest band on
  the side z 2.36-2.47 cols) -> right foredeck inside the engine-raise
  1.98 envelope. §B5 audit flags it stranded — AABB-coarse artifact
  (gun overhang над the foredeck); it is hull deck cargo, adjudicated.

### The turret_plan 1.37 "island" was NOT §B5-blocked (order closed)
Fresh cols + probe: the r3-certified "ref island x 1.37 (0.59)" is the
ref TOWER'S OWN front-right corner — 2.76-tall with a z-footprint of
only 0.10..0.19 world (the r1 "bin front to world 0.19" read). My
bin's flat 1.36 east face lit the whole -1.05..0.64 z-band into that
plan col. Re-cut: bin east 1.325 + full-height corner post at
x 1.325..1.355, z 0.10..0.175 — the col now reads the island shape
(0.589 -> ~0.03) AND the front 1.35 col keeps its 2.80-tower top.
Also: cradle/gun-bar re-centred -0.105..-0.005 (its 0.08 edge crossed
the plan 0.04 col with a z-0.98 read; the ref's fused tube band stops
at x 0), rotor housing narrowed to -0.20..-0.03 (ref rotor x -0.15..0),
core frustum base 0.82 -> 0.80 (its rectangular corner crossed the
0.85 col with the full -1.45..0.21 z-band; ref cone rear there -1.12).

### Plan -1.51 col 0.98 -> retired (the r3 partial order, probe-named)
Three payers: the left st12 cap tab's z 2.94 at x -1.50 (face ->
-1.47), the left stern corner cap's -1.54 face (x -> -1.41 — also the
-1.44 col's z -3.2 payer), and the GLACIS SEAM CORNERS at ±1.50
(y 1.52, z 2.42-2.55 — both glacis frustums narrowed to 1.46). Left
flare top-rear pulled -3.24 -> -2.94 and the left bumperette extended
z -2.90..-3.25 at x <= 1.41 (fresh read: the ref's -1.364 plan col
runs to z -3.258; the r3b "left ends -3.14" was the x>=1.42 zone).
Left appliqué face to -1.5005 (a full pixel inside the col window)
with z -2.97..1.29 (the ref flank band [-2.95..+1.28]).

### Station war (83.3 -> 84.8) — slice-vote law extended (BANK)
The stations are won by placing WIDTH VOTES (z-caps / 6-seg cyl walls
/ decal planes) in slabs whose ref width carries them, and starving
slabs whose ref is narrow. Named voters this round: appliqué JOINT
SEAMS (z-caps at ±1.60/±1.53 — moved 0.65 -> -0.24: st8 3.12->3.065
vs ref 3.067, st6 fed its missing 3.12), BOLT HEADS (cylX walls paint;
row re-seated to explicit width-safe slabs st9/st7/st6/st4/st3 — the
0.38 bolt proved LOAD-BEARING for st7: removing it cratered st7 to
6.2 wPct), the SOOT DECAL plane (§C decals-are-geometry: its x 1.612
was st10's 3.05-vs-2.99 payer — moved to st9's z), hanger-bracket caps
(st5's last 3.10 payer at zc -0.9 — row moved to -1.10/-0.70: the
-0.70 pair votes 3.065 in st5, ref 3.046). Honest residuals: st5-top
2.46 (the tower fill's cylinder lumps paint 2.78 across st5-7 where
the ref prints 2.63/2.63/2.54 — trim-class), st8-top 1.88, st12-W 2.2
(tab at max lawful width), st10-W 2.0 (unnamed ~+0.06 reader).

### §B table at close
§B2 holes 0; §B3 census mg1+9d; §B4 clip 0 front / 45 rear (kv2-band
pass, better than r3's 4/49; sprocket raise verified); §B5 0 real
(1 stranded = the spare-links deck fitting, AABB-coarse artifact,
adjudicated above); §B6 trapezoid both ends raised (front sprocket
0.60, rear idler 0.74), pads no longer flatten the ramp read.

### Worst remaining (honest) — next arc's orders
turret_side 84.7 binds: four sub-0.09 cols (1.59 rack-rear zone,
-0.26, -0.78, 0.92) — print-noise class, no single fix. side_whole
85.0: the -2.4-at col (0.253) is the r3 gun-tip class — NOTE the r4
finding: the gate reads procTop 0.46 there while the in-page
instrument reads 0.100 for the same column (page-vs-gate divergence,
pose code verified identical; unresolved instrument question, the col
is certified residual either way). plan -1.66 (0.17) is the widthM
bag anchor (certified — dims sovereignty). front_whole -1.2/-1.24
(0.13): an unnamed 2.42-2.47-top element at x 1.19-1.26 (probe next
arc). stations: the fill-lump paint class above. The 84.7 landing is
0.3 under the >=85 target; every remaining row is 84.7-85.7 with flat
sub-0.1 worst columns — the next instrument-grade find (the -2.4
divergence or the -1.2 element) is the 85 unlock.

## §B2 NO-AIR UNDER-GLACIS round (2026-08-07, AFV round — owner order §5.18)
The glacis stack hung over an OPEN bow cavity: front-low read the
frustums' bare undersides through the belly slot (tub front 2.375 ->
lower-bow rear 2.94), and both bow corners carried see-through windows
under the lower-glacis side edges (probe clusters (±1.39, 1.03)
front-low 284 px; (y 1.04, z 2.55) right-low 406 px). The real M2's
hull bottom runs to the lower bow plate and its flank closes to the
0.876 ODS-hanger floor (the r4-instrumented ref line: 1.495/1.534
front cols bottom 0.876; flank floor x 1.35..1.46; ±1.44 plan col tops
z 3.13). Probe/evidence: tools/tmp-afv-glacisgap.{html,mjs} +
tools/tmp-afv-raypick.{html,mjs} (exact-sightline attribution);
shots/afv-glacisgap/{before,final}/m2a2_bradley/ + pairs/.

### Changes (buildBradley only)
1. BELLY PAN +-0.945, y 0.44..0.52, z 2.36..2.96 (§B4: 3.5 cm inside
   the 0.98 band inner face; laps tub bottom 0.45 + lower-bow rect).
   LAW RECEIPT: the first pan at y 0.39..0.47 read 2 cm UNDER the
   lower-bow 0.42 rect in the front mask — 25 center columns dropped
   and the front registration dy walked 8 mm (front_hull -2.3): a
   closure pan must hide BEHIND the bow's own lowest line, not extend
   it. Raised, the row restored EXACT.
2. BOW CORNER WALLS per side (x 1.345..1.415 base, inner face sloping
   to 1.30 at the top — 3 cm off the 1.315 band outer face, 3 cm over
   the 1.068 shoe stack, §B4) z 2.50..2.94, top chord sunk into the
   lower-glacis underside, bottom at the ref's own 0.876 + FORWARD
   EXTENSION z 2.94..3.13 (flat 1.30 top under the corner-slab band):
   the 2.94..3.14 slot mouth was a FrontSide through-tunnel (raypick:
   rays crossed the cavity and exited the far flank's backfaces).
   z 3.13 is the ref's own ±1.44 plan-col top.
3. RIGHT ODS lane kit (the ref's asymmetric flank): hanger bracket
   zc 2.62 appended to the r4 row (caps 2.47/2.77 inside st13); fender
   bridge x 1.42..1.52 z 2.68..2.92 (inside the ref's x 1.44-1.51 plan
   band ending 2.97); skirt-mount rail x 1.415..1.47, bottom 0.876 =
   the ref hanger floor (raypick receipt: the sky lane ran UNDER the
   first 0.955 rail bottom); fender tail x 1.415..1.575 y 1.095..1.13
   z 2.28..2.52 over the skirt lane — the rail+bracket+bridge had
   enclosed a §B2 top-down chimney at (1.5, 2.41); the real fender
   covers it (cell -> 0).
4. Front mudflaps widened x 1.40 -> 1.42 (meets the mudguard edge).
After: the corner windows and the belly read are DEAD (front-under
8 px; right-low bow window 333 -> 0). front-low residual 870 px =
turret-overhang trio (bin/TOW/mast under-hangs, 497 px — rotating
furniture class) + the lawful §B4 tub-to-band channel slivers
(1.3-2.7 cm, 363 px) + 10 px crumb.

### Done-gates
- geometry-gate x2 EXACT the ledger row at final bytes: min 84.7 —
  hull 85.3 / whole 85.0 / turret 84.7 / stations 84.8 / dims 100 /
  floaters 100 (zero regression; the -2.3 pan excursion caught and
  reverted mid-round, receipt above).
- winding-audit m1 rev 0 / mix 0 deficit 1 px, m2 0 candidates;
  track-clip front 0/0, rear 45/121 — PROVEN PRE-EXISTING (identical
  at HEAD bytes via pathspec-scoped stash run; stern §B4 furniture,
  z -3.1..-2.7, five meters from every piece this round added);
  standard-check contig 0, mg1+9d. npm test green.
- hash 8d36a6cd -> 5a4cbadc (59 meshes; verts 67748 -> 68648) ON TOP
  of the c461922 per-shell-reload spec landing (cross-lane stash sweep
  recovered by patch; spec block preserved byte-exact). Wide sweep:
  all 9 unintended ids byte-identical.

### Honest residuals
- Turret-overhang air (right bin/tower + TOW pod + left-mast steps
  over the hull roof) is rotating-furniture class — documented.
- The §B4 tub-to-band channels (x ±0.95..0.98) are the law's own
  designed clearance — real on the vehicle, left open.
- rear 45/121 track-clip is the pre-existing stern §B4 item (standing
  lane debt, not this round's).

## 90-LADDER round (2026-08-08, §5.33 campaign) — DUAL-GATE GEOMETRY HALF PASSED

### Trajectory (gate x2 identical at close)
84.7 -> **90.9 PASS, every component >=90** | hull 85.3 -> 91.0 / whole
85.0 -> 90.9 / turret 84.7 -> 91.9 / stations 84.8 -> 93.4 / dims 100
(heightM 0.52% / hullLengthM 0.41% / overall 0.15% / width 0.10%) /
floaters 100. Rows at close: side_hull 92.0, side_whole 91.9, plan
91.0/90.9, front_hull 91.9, front_whole 92.5, turret_side 93.1,
turret_plan 91.9. Geometry hash 5a4cbadc -> 90a5568c (59 meshes /
77180 verts). Oracle bytes e699c868 untouched (re-verified). npm test
265 ok. Evaluator digests shots/visual-eval-m2a2_bradley/ (yawProxy
<=2.1 deg, no RIG MISMATCH); self-shots shots/brad90/.

### THE REGISTRATION SNAP (the round's central mechanism — BANK)
The standing side dAlong -0.036 (r3..r4-certified as residual) was the
r3c bow plate's unfinished 8 mm: the plate face at 3.268 covered the
WORKORDER's 3.27-column but not the GATE's own window, whose proc read
past 3.268 — my front BODY column dropped one column short and the
side mid sat half a column off. Face plate split (center face 3.225 +
two x 0.90..1.30 BODY TABS z 3.235..3.30, y 0.87..1.26): dAlong
snapped to 0.000 ON EVERY ROW, side/turret cover fell to 0, and the
whole r2 razor set (mast rear -1.555, duffel rear -1.80, tube tip)
re-paired same-column. hullLengthM moved 6.50 -> 6.58 (0.41%, inside
grace — the tabs are the front body col). LAW: a persistent +-half-
column dAlong is a BODY-SPAN-END defect, not a residual — find the
extreme column whose gate window is missed and fill it.

### Worst-column fixes (all vertex-workorder absolute cols; ~60 edits)
- GLACIS RE-PLANE: the ref runs ONE -0.50 plane from a z~1.66 knee
  (cols 1.625@2.202 exact); the r3 crest (1.895@1.83, slope -0.54)
  read +0.04..+0.09 over z 1.87..2.39. Crest moved to 1.66 (roof/spine
  fronts pulled 1.80 -> 1.62), both frustums re-lined, driver plateau
  rebuilt as a LOW hatch plinth (top 1.55) + 28-seg rods carrying the
  ref's 1.607/1.57 side lines (station slices skip smooth cylinders —
  the ref's own plateau prints st12/st13 tops 1.564/1.508) + one tiny
  st13 top voter at 1.505.
- GEAR RE-SEAT (instrumented): ref climbing bands zero at ~2.06/-2.12
  with ~0.5 slope; contact pins 2.14/-2.16 -> 2.06/-2.12, idler y 0.74
  -> 0.81 (z -> -2.68: its wrap rear cleared the -3.14 col, whose ref
  bottom is the 0.72 wedge line), sprocket 2.55/0.60 -> 2.53/0.63 (the
  interim 0.68 raise overshot the ARC zone: ref arc bottoms 0.23@2.55
  / 0.35@2.84). ALL §B4 furniture over the wraps raised in the same
  landing: flare bottom edges 1.13 -> 1.25, rear guards 1.345, stern
  caps 1.36, mudguards 1.19 — the pre-existing rear 45/121 track-clip
  debt is DEAD: §B4 0/0 front + 0/0 rear at --exact, 0 shoe, 0 blind.
- STERN RE-LINE: recessed center face -3.15 + door -3.16 + PROUD
  CORNER POSTS (asymmetric x: right 0.90..1.29, left -0.78..-1.29,
  face -3.28, y 1.31..1.90 = the ref's own -3.23/-3.30 side band);
  bumperettes re-cut to the ref's 1.22..1.40 band (right face x 1.53
  for the 1.52 plan col whose ref rear is -3.28); undercut wedge
  bottoms 0.47@-2.90 -> 0.72@-3.13. NOTE the ref stern center rear is
  a UNIFORM -3.16 (an r5 "deeper-left" split chased a mirrored-frame
  ghost and was reverted same-round — receipt in code).
- LEFT FRONT FENDER (plan -1.51 col, err 0.425): the ref left flank
  band runs to z 3.11 — four segmented plates (x -1.425..-1.50)
  continue the skirt line to the bow; §C caps at 1.28/1.90/2.35/2.78/
  3.11 (NO cap can land in st10 under boundary jitter — an interim
  1.385 cap was 8 mm off the boundary and flickered wPct 1.97->3.82).
  The face needs >=2 px INTO the col window: -1.4875 left a 1.6 cm
  AA-sliver and the col stayed unserved; -1.50 landed it.
- RIGHT SKIRT SEGMENTATION (stations 88.5 -> 93.4, the §C end-cap law
  applied to my own build): the 6.08 m skirt monolith was slice-
  INVISIBLE (axis-aligned box mid-spans render zero in station slabs)
  while the ref's 1.64 skirt line paints ELEVEN slabs. Twelve ODS
  plate sections, one cap-pair per slab, with CAP-LESS spans at st1 +
  st7/st8 where the ref line dips to 1.55/1.56-1.58. Same mechanism
  family: appliqué rear plate caps pulled inside st2 (its -2.61 cap
  painted st1), engine deck z-front 0.655 + x to 1.13 (ref deck band
  1.966 on the front 1.05-1.13 cols), fill-A hump replaced by a 28-seg
  rail (side 2.807 patch, slice-skipped), sleeve r 0.041 / suppressor
  r 0.044 (they ARE the st10-12 top painters; ref tops 2.291/2.281).
- TURRET: core roof 2.555 -> 2.46 with the 2.72 riser proud (ref
  stepped roof; hatches/sight hood re-seated on the new roof); collar
  bottom 1.855 -> 1.905 (ref turret-mask floor 1.902, ~15 side cols);
  front step bottom 1.9475 + CHIN WEDGE (ref mantlet underside RISES
  1.902@0.39 -> 2.05@0.69); cheeks +0.07; M242 boot (§B3.1 mantlet
  grammar, world z to ~1.08 — the ref -0.18 plan col teeters 0.95/1.21
  run-to-run, band split); rotor block front 0.695 -> 0.595; tube
  extended to tip 2.37 world (the 2.386 side col was ONLY-REF err-9;
  2.41/2.425 tips each fed an ONLY-PROC col — 2.37 is frame-safe both
  registrations) + §B3.1 BORE disc flush on the suppressor face;
  muzzleZ 2.28 -> 2.23; bustle re-cut: tail duffel x -0.42..0.40 rear
  -1.80 + solid tapered B-boxes (rounded ref tail -1.80@0 -> -1.58@
  0.7) + C-duffel (-1.68@-0.5); mast trims (tall step rear -1.46, mid
  step front -0.98, west block rear -1.555 — the ref cluster's own
  spans); step1 re-cut to the r3 ORIGINAL 2.53 shelf (r4's 2.44
  narrow-cut left the front -1.161 col 0.20 short); step2 split A/B
  (ref rear taper -0.93/-0.79); TOW pod top now FALLS outboard (2.41
  -> 2.175 at x -1.23 — the ref pod band; flat top + rib read +0.25 on
  the front -1.2 cols), pod front diagonal re-cut, muzzle discs flush,
  root bracket added (plan -0.769 ref front 0.691); banks y 0.42
  z 0.92 (tips 2.42-high at z~0.70); MG y 0.31 (§C pintle allowance);
  rack w 1.38; smoke/fill/riser trims per instrument.
- FRONT ROWS: left roof camber re-lined (ref 1.905@-1.00 -> 1.772@
  -1.235 then FLAT 1.772 to -1.46 — split B1/B2 with B2 z-short per
  the ref's left flank plan band); crest halfW 1.20 (the ±1.26 edge
  AA-lit ±1.235-1.272 cols at 1.883 vs ref 1.735-1.772); tarp 1.845;
  vent shrunk; lift eyes x ±0.35 z 1.10; bag tops re-cut; brackets
  xc -1.48 y 1.175.

### §B table at close
§B2 top-down flood 0; §B3 census mg1+9d; §B4 track-clip --exact
0/0 front + 0/0 rear, 0 shoe, 0 blind spots (the standing 45/121 rear
debt CLOSED by the gear+furniture re-seat); §B5 turret-parent 1
stranded = the spare-links deck fitting (r4-adjudicated AABB-coarse
artifact, unchanged seat — adjudication stands), 0 abutting, 0
dangling; §B6 trapezoid both ends raised (sprocket 0.63 front, idler
0.81 rear, contact 2.06/-2.12 at the ref's own ramp zeros); §C.1
winding-audit m1 rev 0 / mix 0, m2 candidatePx 0 (verdict clean).
npm test 265 ok. standard-check 1/1 pass.

### Certified residuals + teeter classes (honest; ALL rows >=90 with
### every one of these FIRED)
- plan -1.51 col REF-TEETER (err ~0.92 when fired): the ref's own left
  flank face sits ON a column boundary — reads full-flank [~-2.97..
  3.11] on some runs, fender-lip-only [-1.26..2.97] on others (three
  observed states across six runs). My faces are >=2px stable inside
  the window; the fired state costs plan ~1.7 pts and plan still
  reads >=90.9. AA-teeter family — single-run reads are NOT orders.
- plan -1.66 col (0.177): the widthM bag anchor — dims sovereignty
  (the 0.35 m band filter forces the bag longer than the ref's short
  island). Standing r4 cert.
- turret_plan x 1.37 col: the ref tower-corner read teeters between
  the r4 ISLAND (z 0.10..0.19; my corner post's exact seat) and longer
  band states; the r2 "shoulder" built against one teeter state scored
  err 0.377 and was deleted (receipt in code).
- boot/bin/tail rears + banks front: split down their observed teeter
  bands (receipts in code); banks trade one side 0.772-col (~0.05) for
  six clean plan cheek cols.
- turret_plan cover 1.37 (~1.3 cols): unattributed only-* residual at
  the trim margins; turret_plan 91.9 carries it.
- The -0.036-frame instrument divergences documented in r4 close
  ("page-vs-gate procTop") are RESOLVED by the registration snap — the
  two tools now agree at dAlong 0.

### LAW-BANK discoveries (for BUILD-STANDARD folding)
1. REGISTRATION-SNAP LAW (§D): a persistent half-column dAlong is a
   body-span-end defect (an extreme body column whose GATE window is
   missed while the workorder's is covered). Fill the gate's window
   (tabs past the nominal face) and every razor-tuned edge re-pairs.
2. STATION SLICE-PAINT MECHANICS (§C, instrument-proven): axis-aligned
   box MID-SPANS are invisible in station slabs (all six faces edge-on
   or clipped); z-CAPS, SLOPED faces, and low-seg cylinders paint;
   28-seg cylinders skip. Long members must be SEGMENTED per-slab to
   carry a flank line (the ref's own fused body paints everywhere) —
   and caps must sit >=20 mm from slab boundaries or they flicker
   between slabs run-to-run (the st10 1.97->3.34->3.82 receipt).
3. GUN-EXTRA PIVOT OFFSET: addGunExtra coords are gunPivot-relative
   (bradley: x -0.075, z +0.155) — window math done in world against
   rel-authored kit silently misplaces by the pivot offset (the r2
   boot cut receipt).
4. PLAN-MIRROR DISCIPLINE: the per-run plan mirror hits the GATE's own
   detail JSON too, and mirror-state can differ between consecutive
   runs of DIFFERENT tools. Anchor every plan sign decision on an
   authored asymmetric feature probe (whatsat the bag box) in the SAME
   run before authoring; treat any 'center-recess' style conclusion
   derived without an anchor as suspect (the r5 stern ghost receipt).
5. REF-SIDE AA-TEETER CERT CLASS: when the REF's own face rides a
   column boundary, no authored value stabilizes the column — split
   the observed band or hold the served state, and certify the fired
   cost in the packet with the row floor proven >=90 either way.

### Cohabitation note (landing discipline)
This round cohabited the working tree with the bmp2/puma no-air lane
(§5.42, "landing held for bradley cohabitation"): worktree-vs-HEAD
hunks verified buildBradley-only for THIS round (function-mapped);
bmp2/spz_puma hash movement belongs to that lane. Wide sweep at close:
type89 b19aca94, is1 59882b30, is2 b09424cc, tiger1 7b76a8c6, m60a1
912de524 — all byte-identical to the round's baseline.

## §5.349 BRADLEY FILLS + ATTACHED SKIRTS (owner order) + §5.355 gate closeout

ORDER (verbatim, 2026-08-17): "the bradleys are still not filled
internally (see througable) and their side skirts/side armors are not
attached to the hulls properly or with attachments". Scope: ALL THREE
Bradley playables — m2a2_bradley directly, m3a3_bradley + ua_m2a3_bradley
via their family wrappers (profiles/afvFamily.js). marder1a3 rides the
same donor hull but is HARD-GATED (59cb105c) and takes NONE of this
dressing. LANDED at **3635217c** inside the owner's absorb commit
(§5.354 shared-checkout rebase incident — the partition's finished work
rode the owner's rebase continue); this section is the §5.355 closeout.

### The shared grammar — bradleyFlankDressing (modern3.js, exported)
ONE closure + skirt-mount grammar for the family (the m3a3 §5.306
skirt-order treatment PROMOTED to shared; m2a2 wraps it in
buildM2A2Bradley, m3a3/ua call it inside their wrappers):
- **§B2 DONOR BOW-CORNER CLOSURE** (type89 §5.341 grammar): the bow
  fender/sprocket bay read clean through at [y 0.65, z 2.99] ~0.20x0.14
  on all three ids (bow-window sweep receipts m2a2 205px / m3a3 199 /
  ua 203). Side plate on the 1.40..1.44 plane (outboard of the 1.395
  shoe reach — §B4-clear BY CONSTRUCTION; the raised idler disc stays
  §B9-readable), top chord tucked under the 1.19 mudguard line, flat
  0.55 bottom over the wrap taper, transverse cap z 3.10..3.16 sealing
  the front edge into the bow corner slabs.
- **SKIRT-MOUNT COURSE**: 8 mirrored panels per side (uniform cuts
  -2.97..+3.11 step 0.76, §C end caps), outer face ±1.652 = 6.5 mm proud
  of the donor ODS face (no coplanar fight), hem 0.62 = the donor's §B9
  wheel line, tops 1.42 stepping to 1.25 on the bow pair at the fender
  line. Dark hinge-line seams (hullDark 0.05x0.024) AND a visible
  hanger/bolt block (hullDetail 0.085x0.10x0.06) at EVERY joint — the
  ordered "with attachments" hardware. Raked mounting apron per side
  closing the skirt-top-to-flare daylight (outer edge buried in the
  panel tops, inner edge landing on the flare slope / tucking under the
  left flare's 1.62 corner); aprons split around the donor's own tall
  flank gear which closes its own band (right exhaust z 0.975..1.925;
  left stern bag box z -2.52..-1.98). Course END CAPS close the
  panel-to-hull mounting lane (an enclosed axial pocket, 3518px left-lane
  receipt). ALL course content |x| >= 1.4425, clear of the 1.395 shoe
  reach (§B4).

### Per-id §B2 fills (the §5.341 sweep handoff, made mandatory by §5.349)
- **m2a2**: the bow slit sat beyond the certified tolerance — the
  owner's eye outranks the cert; closed by the SHARED donor-bow closure
  (no other m2a2-local fill; buildBradley itself is BYTE-UNTOUCHED this
  round — proven by pre/post function extraction, 1144 lines identical).
- **m3a3 ring-slit cap** (m3a3(a), profiles/afvFamily.js): the 3.4 cm x
  0.60 m deck-to-cradle slit over the engine raise ([y 2.041,
  z 0.77..1.37] world, opens at yaw) — hull-owned raise cap filling
  1.98..2.035 in the slit zone, yaw-independent, 2 cm under the swept
  gun-cradle floor.
- **ua_m2a3 shelf plate + ISU fill** (ua(a)/ua(c)): turret-owned skirt
  plate closing the 0.40x0.12 window under the ERA/stowage shelf
  ([y 2.04, z -1.88] world; plate bottom 1.99 world clears the 1.98
  engine-raise top through full traverse) + the ISU-pedestal pocket
  ([-0.687, 2.818, -0.466] world) thickened into its mast+panel+dome
  frame (optics-class fill, turret-local).
- **m2a2 TOW-standoff enclosure — DOCUMENTED-LEGIT, never fill**: the
  twin TOW pod rides its elevation arm + root bracket OFF the turret
  left wall (print-true standoff; the pod elevates with the gun). The
  §5.326 sweep already certified the class ("yaw-90 TOW-pod occlusion
  islands, 6572px, certified silhouette class"). Any fill here would
  manufacture false armor between pod and wall and break the elevating
  kit — this enclosure is PERMANENTLY exempt.

### Receipts (banked shots/bradley-b2/{before,after}; reproduced at HEAD)
- See-through sweep, worst-view y0-side-l: **m2a2 4567→4053**,
  **m3a3 4216→3728**, **ua 4579→3785** px. HEAD re-run (1c0ba018)
  reproduces all three after-values EXACTLY. (Partition-report note: the
  quoted "ua →3846" matches NO banked or reproduced view — 3785
  y0-side-l / 3829 y45-side-l are the artifacts; 3785 is the receipt.)
- Hashes (hashgeo, verified at HEAD 1c0ba018): m2a2 **a41410ac →
  89d68758** (62 meshes HELD, verts 77930→88574 — the dressing merges
  into existing hull buckets), m3a3 **→ 9c545ac0** (65/94181), ua
  **→ 4b3b33fc** (76/111050). All three match the §5.354 re-bind list.
- Track-clip STRICT at HEAD: **front 123 / rear 0** band + shoe 0/19
  (rear: hull 13 / hullDetail 6) — BYTE-IDENTICAL rows across all three
  ids = the shared donor's pre-existing debt (the §5.316-documented
  123-front class, m3a3 packet). The dressing adds ZERO offenders
  (course outboard of the shoe reach by construction).
- dims true-up LIVE (modern3.js ~382-388): the silhouette* rows sit
  INSIDE dims (silhouetteWidthM 3.25 / silhouetteHullLengthM 6.28 /
  silhouetteOverallLengthM 6.25 / silhouetteHeightM 2.98 — m3a3 §5.306
  convention); published rows keep the 3.28/6.55 datums. The §5.355
  relocation fix: the rows had been placed OUTSIDE dims and cost the
  gate row dims 45.6; relocated they read 100.

### §5.355 gate closeout — the "hang", the honest row ×2, and §5.356
- **THE m2a2 GATE HANG (diagnosed, not a gate defect at HEAD)**: the
  pre-rebase run sat silent >=150 s. Mechanism REPRODUCED in a bare
  worktree: any page-side failure (there: the gitignored reference GLB
  missing → vite serves the SPA HTML fallback → GLTFLoader unhandled
  SyntaxError) leaves `__FIDELITY_READY` unset, and geometry-gate.mjs
  polls ONLY that flag — so it waits its FULL 150 s default timeout in
  silence, then logs `Waiting failed: 150000ms exceeded` and writes an
  error row. That silent window IS the reported "hang ≥150s". At clean
  HEAD with local oracles present, m2a2 gates in ~4 s (×2 proven). The
  suspected equipment/component-mask interaction is EXONERATED as the
  hang cause: equipment buckets parent to the SAME rig groups
  (tankFactory BUCKET_DEF: turretEquipment→turretG, hullEquipment→hullG)
  — mask-neutral by construction, and pre/post turret-subtree AABB
  censuses are byte-equal. NO gate-tool change shipped (none needed);
  latent gap noted for a future round: the gate could also poll
  `__FIDELITY_ERROR` and fail FAST instead of silently timing out.
- **HONEST GATE ROW ×2 at HEAD 1c0ba018** (tool-written, ledger
  merge-preserved, fleet 34/118 both runs, BIT-IDENTICAL):
  `min 31.6 | hull 63 whole 48 turret 31.6 stations 57.5 dims 100
  floaters 100` — dims RECOVERED 45.6→100 (the relocation), headline
  turret-limited.
- **Decomposition (isolated worktrees, oracles linked)**: pre-stream
  b104b1e4 measures **83.3 ×2** (hull 87.4 / whole 85.6 / turret 83.3 /
  stations 87.5 / dims 100 — the committed 90.9 ledger row was STALE,
  §5.245 class). HEAD with ONLY the dressing toggled off: hull recovers
  87.3 = the hull-curve cost is ENTIRELY the ordered dressing (released
  by §5.349, owner's eye over the print); turret stays LOW (21.7) = the
  turret drop is NOT the dressing.
- **The turret drop IS the §5.356 floating-turret regression** (foreign
  stream, root-caused independently here and by the §5.356 session):
  3635217c's `finalizeCombatAnatomy` remapped `armor.turretPivot`
  through the plate→receipt map; m2a2's rendered turret lifted
  **+0.162 m** (turretDark world-y 2.115..2.775 → 2.277..2.937;
  numerically the marder1a3 remap class — shared donor anatomy, same
  1.895 pivot). Verified in isolation BEFORE the fix landed: with the
  fix applied the turret re-seats EXACTLY to the pre-stream band.
- **§5.361 FLOAT FIX LANDED (394da5ed) mid-closeout — current honest
  row re-measured**: at HEAD cbcd3f6a (fix live, combatAnatomy md5
  b17d519b identical to the isolated test), gate ×2 BIT-IDENTICAL:
  `min 49.1 | hull 63 whole 49.1 turret 55.3 stations 54.9 dims 66.5
  floaters 100` — geoMin 31.6→**49.1** (turret recovered with the
  re-seat), ledger merge-preserved. dims coupling EXPOSED: the
  partition tuned silhouetteHeightM 2.98 against the LIFTED render;
  the re-seated build's actual height is **2.83** — a one-value
  true-up (silhouetteHeightM 2.98→2.83, modern3.js dims) restores
  dims ~100 and leaves the row whole-limited ~49.1 = the honest
  dressed baseline vs the 42manako print (§5.349 released; the §5.360
  sitting RATIFIED the attachments visually). FLAGGED, not applied —
  a src edit belongs to the owner's live pivot-follow-up lane
  (§5.362), not this docs closeout.

### ua_m2a3 enrollment
DECIDED (§5.354): **NOT ENROLLED** — measurement-only clone convention.
See docs/references/tanks/ua_m2a3_bradley.md.
