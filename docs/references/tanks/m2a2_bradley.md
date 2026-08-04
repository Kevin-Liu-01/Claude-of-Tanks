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
