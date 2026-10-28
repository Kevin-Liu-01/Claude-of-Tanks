# Patton family redesign — release 262 batch record

Owner, 2026-10-27: "also should update/redesign the m47, m46, and m48 pattons"; for the batch, "update/redesign ...
turrets and hullls as well based on proper historical referrences so they will no longer look so chungus". Mid-run:
"use this patton for the m48" (`~/Downloads/m48a5_patton.glb`). Lane `item/patton-family-262` from `b93941ce9d`
(release 260); the KV-2 was another lane's share.

## Scope

| ID | Packet | Source of shape | Result |
|---|---|---|---|
| `m46_patton` | [m46_patton.md](../../references/tanks/m46_patton.md) | the gate's recovered reference model (width-normalised), checked against Hunnicutt/AFV Database dimensions and the Tancrémont and Bovington photographs | new hull, Pershing turret, rotor shield, M3A1, rebuilt to the reference's castings and running gear |
| `m47_patton` | [m47_patton.md](../../references/tanks/m47_patton.md) | the gate's recovered reference model, checked against TM 9-718A (1952), TM 9-2350-200-12 via Hunnicutt and the Latrun and Brussels photographs | new hull (60° glacis), T42 turret, M36, rebuilt to the reference's castings and running gear |
| `m48a5_patton` | [m48a5_patton.md](../../references/tanks/m48a5_patton.md) | the owner-supplied ater.studio M48A5 (source-world certified), Hunnicutt/AFV Database, US Army photographs | rebuilt to the owner's model: landmark hull and dome, thin gun shield, its equipment and spare road wheel |
| `m60a1`, `m60a2`, `m60a3` | — | unchanged | byte-identical high/low builds (fleet geometry ledger `--check` PASS on the lane before any regeneration) |

## What made the old builds "chungus"

1. The August 2026 "lower Pershing and Patton turrets" pass (`6d44952320`, `applyLowProfileTurret`) compressed the
   M46 casting to 0.78 and the M47's to 0.65 of their height and widened their cheeks: 0.8 m-tall, 2.35 m-wide slabs.
2. The M48A5 was fitted to the ATModeler print: a 2.96 m dome (the real one is about 2.4 m), a 0.63 m belly, a tension
   wheel the A5 does not have, and box-section hull slabs.
3. All three hulls were mask-fitted slab stacks (hundreds of per-column pods and wedges tuned to the gate's pixel
   columns) rather than closed castings.

## Construction

`src/vehicles/profiles/pattonCast.ts`: each M46/M47 casting is a closed `sectionSolid` loft through a station table
(floor, roof, widest half-width, roof and foot fractions, waist height, superellipse exponents); hulls are the same with
a hull ring (floor, vertical lower side inside the track lanes, sponson, rolled deck edge). The M48A5's hull and dome
are landmark lofts (`LandmarkStation`: keel and crown heights, five named knots and six span bulges per station, read
off the owner's model; the spans between knots are first-party quadratic arcs, with Catmull-Rom stations between rows
at HIGH), the tank-generation rule of sparse measured landmarks rather than sampled contours. Running gear uses
`KIT.buildRunningGear` and the nation wheel sets. The retired builders (about 4,200 lines) were deleted from
`patton.ts`, which now holds only the M60 family.

## Owner decisions and choices recorded here

- The M46 and M47 follow the geometry gate's recovered reference models. The first release-262 builds were drawn from
  the dimension tables and photographs alone and scored 0 and 8.6 against those references (main's slab builds had
  91.2 and 91.0); the references themselves are faithful (the photographs agree with their turrets, shields, hulls and
  running gear), and the "chungus" look came from the old builds' slabs and the August low-profile squash, not from
  them. The new builds keep closed first-party castings. Where the references depart from the vehicle the build stops
  short of them: the 90 mm tubes are drawn 0.25-0.19 m across, not the references' 0.31 m. Where a reference omits an
  item (antennas, the lift eyes, the M46/M47 rear mufflers) the build omits it too.
- `tools/gatesim.py` (lane evidence, not shipped) reproduces the geometry gate offline (same union cameras, 1024 masks,
  96-column traces, curve score, legacy hull-span registration or fixed certified registration, stations and both
  dimension rulers) to within about a point, so a fit can be iterated without the shared capture queue.

- The M48A5 shape follows the owner's supplied model; it replaces the ATModeler print as the comparison oracle
  (`tools/procedural-fidelity.html`, `tools/visual-evaluator-page.html`, `tools/vehicleComparisonSources.mjs`).
- The M48A5's gun follows the owner's model (the owner, 2026-10-27, "match its geometry!"): bore axis 1.921 m, pivot at the
  source-world certificate's station z 1.7616. The 258 fix's 2.10 m trunnion answered the old 1.80 m deck; the model's
  deck is 1.47-1.53 at the driver and 1.51 under the turret, and the low shield clears it at -9 deg.
- The M48A5's comparison oracle is source-world certified (`source-x-oracle --prepare`, rigid -x/y/-z, scale 1;
  `m48a5_patton_x_source.glb`, exemplar 92): the legacy registration rescaled the model to the published width (2.4 %).
- The model's stowed "drum" on the bustle is a spare road wheel (the owner, 2026-10-27); it is drawn by the running
  gear's own nation construction.
- M47 depression: −10° (TM 9-2350-200-12, 1958, and Hunnicutt) over TM 9-718A's 1952 −5°.
- The M48A5 carries no smoke dischargers (no US source; the model's flank lumps are hung rucksacks); its cupola is the
  low-profile one with two M60Ds (the post-1976 US standard; early A5s kept the M1 cupola).
- The M48A5 keeps the published 115 in track centres (the model's are 1.6 cm wider a side) so it stays within the
  published 3.632 m width.
- Sim floors accepted for the three ids (`docs/geometry-gate/sim-floors.json`): the M48A5's belly at its 16.5 in
  clearance and the removed tension idler move its pan and hull floor; the M46/M47 pans rest on their wheel hubs.
