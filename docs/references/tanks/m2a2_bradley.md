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
- Suspension: **6 road wheels** per side, rear drive sprocket, front
  idler, 3 return rollers; tracks with removable rubber pads.

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
