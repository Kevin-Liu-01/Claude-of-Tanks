# Patton family redesign — release 262 batch record

Owner, 2026-10-27: "also should update/redesign the m47, m46, and m48 pattons"; for the batch, "update/redesign ...
turrets and hullls as well based on proper historical referrences so they will no longer look so chungus". Mid-run:
"use this patton for the m48" (`~/Downloads/m48a5_patton.glb`). Lane `item/patton-family-262` from `b93941ce9d`
(release 260); the KV-2 was another lane's share.

## Scope

| ID | Packet | Source of shape | Result |
|---|---|---|---|
| `m46_patton` | [m46_patton.md](../../references/tanks/m46_patton.md) | Hunnicutt/AFV Database dimensions, Tancrémont and Bovington photographs, the Bergman print | new hull, Pershing turret, rotor shield, M3A1 |
| `m47_patton` | [m47_patton.md](../../references/tanks/m47_patton.md) | TM 9-718A (1952), TM 9-2350-200-12 via Hunnicutt, Latrun and Brussels photographs, the Bergman print | new hull (60° glacis), T42 turret, M36 |
| `m48a5_patton` | [m48a5_patton.md](../../references/tanks/m48a5_patton.md) | the owner-supplied ater.studio M48A5, Hunnicutt/AFV Database, US Army photographs | new boat hull, egg dome, low-profile cupola fit |
| `m60a1`, `m60a2`, `m60a3` | — | unchanged | byte-identical high/low builds (fleet geometry ledger `--check` PASS on the lane before any regeneration) |

## What made the old builds "chungus"

1. The August 2026 "lower Pershing and Patton turrets" pass (`6d44952320`, `applyLowProfileTurret`) compressed the
   M46 casting to 0.78 and the M47's to 0.65 of their height and widened their cheeks: 0.8 m-tall, 2.35 m-wide slabs.
2. The M48A5 was fitted to the ATModeler print: a 2.96 m dome (the real one is about 2.4 m), a 0.63 m belly, a tension
   wheel the A5 does not have, and box-section hull slabs.
3. All three hulls were mask-fitted slab stacks (hundreds of per-column pods and wedges tuned to the gate's pixel
   columns) rather than closed castings.

## Construction

`src/vehicles/profiles/pattonCast.ts`: each casting is a closed `sectionSolid` loft through a station table (floor,
roof, widest half-width, roof and foot fractions, waist height, superellipse exponents); hulls are the same with a
hull ring (floor, vertical lower side inside the track lanes, sponson, rolled deck edge). Running gear uses
`KIT.buildRunningGear` and the nation wheel sets. The retired builders (about 4,200 lines) were deleted from
`patton.ts`, which now holds only the M60 family.

## Owner decisions and choices recorded here

- The M48A5 shape follows the owner's supplied model; it replaces the ATModeler print as the comparison oracle
  (`tools/procedural-fidelity.html`, `tools/visual-evaluator-page.html`, `tools/vehicleComparisonSources.mjs`).
- The M48A5 trunnion stays at the 258 owner fix (2.10 m at z 1.514), 10 cm over the published 78.8 in fire height.
- M47 depression: −10° (TM 9-2350-200-12, 1958, and Hunnicutt) over TM 9-718A's 1952 −5°.
- The M48A5 carries no smoke dischargers (no US source); its cupola is the low-profile one with two M60Ds (the post-1976
  US standard; early A5s kept the M1 cupola).
- Sim floors accepted for the three ids (`docs/geometry-gate/sim-floors.json`): the M48A5's belly at its 16.5 in
  clearance and the removed tension idler move its pan and hull floor; the M46/M47 pans rest on their wheel hubs.
