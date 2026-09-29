# Roster names, proportions, Marder 2 and Ares — 2026-09-29

## Owner instructions

Retain saved vehicle identifiers, but present K21, KF41 Lynx, Puma S1,
CV90105 TML, CV9040C, CV90 Mk 4, Sabra Mk 2, Ajax and Griffin 50 mm without
their source-study X suffixes. Preserve the older Puma S1 upgrade as SPz Wotan, an original German concept.
Add Marder 2 separately. Both choices were explicitly confirmed by the owner.

Apply a uniform 0.90 size factor to K21, KF41 Lynx, Type 100 IFV, LRMV Lynx,
Borsuk, Ajax, Ares, Griffin 50 mm and Griffin Viper. Apply 1.10 to Challenger 1
Mk3. Scale the complete assembly, including wheels, tracks, attachments,
projectile origins and physical damage geometry. No combat statistics change
merely because a model becomes smaller or larger.

Remove Ares's three turret soft packs while preserving hull cargo and gun
hardware. Improve its rear-armor effectiveness without increasing its damage
or fire rate. AP-T penetration is now 80/70/55 mm at 100/1000/2000 m; API-T
68/56/42 mm. These are gameplay values, not ammunition performance claims.

## Implementation

`vehicleSizePolicy.ts` runs after donor registration. A retained native frame
lets each source builder keep its authored coordinates. `profiles/vehicleSize.ts`
bakes the owner factor into geometry and spatial records before batching;
canonical owner rigs remain unit scale. Both eager and lazy registration paths
apply the same policy idempotently. Existing derivatives do not inherit their
donor's new size a second time.

The comparison GLBs remain byte-identical. `tools/owner-size-targets.ts` pins
independent fixed factors for the approved comparison assemblies. Original
source registrations remain available separately. Photo and concept records
preserve the former dimensions alongside the owner's new factor. Comparison
thresholds and the 3% dimension tolerance are unchanged.

Marder 2 uses new first-party geometry and a tall two-person TS503 turret with
a 50 mm Rh503 configuration. Puma S1, SPz Wotan and Marder 2 are three separate roster entries. Wotan
retains its previous model, weapons, tuning and saved identifier; Marder has
independent stats, so no donor-conversion mechanism is necessary. See the Marder reference page and photographic
packet for the explicit unverified numerical 3D comparison status.

## Marder turret follow-up

On 2026-09-29 Kevin requested the Marder 2 turret 10% smaller. The complete
upper assembly is baked at 0.90 around the unchanged bearing, including optics,
hatches, antennas, mask and gun. The gun pivot, collision barrel, turret armor,
modules and crew seats use the same frame. The hull, tracks and 50 mm bore stay
at their existing dimensions. The photo packet retains the original dimensions
and records the requested turret factor and independently computed new envelope.

## Regression coverage

- Whole-vehicle HIGH/LOW bounds, canonical rig scale, launcher poses and repeat
  eager/lazy registration are checked against retained original dimensions.
- Existing source witnesses use the approved scale while retaining their
  original shape/seat/bore tolerances and mutation negatives.
- Ares tests trace actual rear and front armor of five MBTs at 500 m, verify
  unchanged firing rate/damage, and inspect roof decorations across four seeds.
- Marder tests check its actual seven-wheel chassis, tall turret, open elevation
  bay, two turret crew, absence of the Puma missile system and preservation of
  Wotan and existing donor-derived vehicles.
- The historical Challenger draft's merged-buffer hashes were deliberately
  rebased for the 1.10 bake. Its native physical witnesses and source profile
  remain unchanged; native instanced wheel/track buffers retain their hashes.

## Interior-fill evidence

Fresh fills are generated for the affected geometry. K21 retains the original
fill topology scaled by exactly 0.90: revoxelizing it covered real launcher cap
recesses, which its existing physical tests correctly rejected. This does not
claim a new watertight PASS. The original baseline has a 20.09 L diagnostic
voxel leak; the scaled copy reports 14.41 L at the same fixed voxel size.
Fixed-grid voxel counts are not scale invariant. Actual sealed-view, barrel,
stock and source-configuration tests remain separate gates.

## Retained Challenger source failure

The original `f88172442` Challenger 1 Mk3 receipt already failed the fixed-source
comparison: minimum 0, whole shape 84.6, body-height difference 19.4175% and
physical-height difference 14.4559%. The requested uniform 1.10 transform
retains these relative discrepancies; the measured whole shape is 84.8 and
the dimension minimum remains 0. The source packet documents four loose
exported panels below track ground. Neither source pieces nor thresholds were
changed to claim success. On 2026-09-29 Kevin explicitly approved: “Publish the resize; retain the failed comparison status.” This exception applies only to the requested Challenger 1 Mk3 uniform resize, not a new shape qualification or any other vehicle.

Final validation and publication receipts are appended after the checks finish.
