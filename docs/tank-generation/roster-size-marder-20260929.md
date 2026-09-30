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

Publication receipts are appended after the final synchronization with main.


## Datum arithmetic follow-up

The physical concept check exposed an IEEE-754 mismatch after dimension-ratio
scaling: Griffin Viper's ring height computed as 1.8629999999999998 m, while its
independent approved target is 1.863 m. Spatial declaration comparisons now
allow only eight machine epsilon steps, with regression cases accepting one
rounding step and rejecting a 1 nm displacement or invalid coordinates. No
geometry/source dimensions, silhouette floors, 3% envelope tolerance or weapon
requirements changed. Griffin Viper's physical concept check passes afterward.

## Integrated review corrections

The broad suite exposed thirteen failures. Focused reruns pass after correcting
the donor refresh path and bringing the affected receipts/catalogs up to date:

- Both source-combat refresh functions retain the installed resized armor and
  launcher frame. Repeating a refresh must not restore native pivots or invent
  an undefined launcher property on cannon-only vehicles. The size regression
  now exercises both refresh functions twice and both factory entry points.
- Marder 2 is included in the public total (201), ammunition census and factory
  paint catalog. The older retained CV90 Mk 4 is labeled **CV90 Mk 4 Concept**
  so the supplied-model CV90 Mk 4 has a distinct display name.
- Ares reference coordinates, KF41 recess witnesses and Challenger physical
  rays use the independently fixed owner factors. Only the approved Ariete
  attachment repair changes the old donor-spec census; all other donor rows
  match the retained pre-edit tree.
- Borsuk's forward skirt heel rises 40 mm in the native authoring frame. Fresh
  strict HIGH/LOW track audits report zero band or shoe intersections in the
  front, rear and complete sweep. The remaining vehicle shape is retained.
- Exact original K21 and Griffin source files were recovered locally and their
  hashes match the existing configuration records. No source hash or equipment
  requirement was changed to clear the missing-file failures.

Griffin's bore probe also exposed an exact shared-triangle-edge ray miss. The
probe retains raw cardinal hits and requires the off-seam course plus both
seam flanks at the unchanged radius. Actual annular-mesh regressions cover both
scales and reject missing sectors and foreground obstructions.

## Validation before main synchronization

The broad run selected and completed 1,276 entries: 734 executed and 542 reused
unchanged passing receipts. It exited 1 with thirteen failures; each failed
entry subsequently passed a focused rerun after the corrections above. This
is not a claim that the original broad invocation exited successfully.
Type checking, public and private production builds, attribution and public
repository hygiene pass.

All sixteen non-legacy IDs pass the physical standard across the initial and
corrected runs. Fresh Borsuk/K21/Griffin standards pass; Borsuk's sealed check
and Griffin's actual rendered muzzle check pass after their corrections.
The nineteen-ID centering, module alignment, module-hit, track-duplication and
barrel-circularity probes pass. The three legacy repairs retain their recorded
source exceptions; their sealed checks pass. Marder 2 retains its explicit
photo-reference qualification and unverified numerical 3D comparison.

Machine-readable invocation results remain in the ignored local evidence
directory `.qa-dev/roster-size/`: `final-repair-validation.json`,
`final-selftests.json`, `failure-retest.json`, `last-retest.log`,
`remaining-release.json`, and `repair-finalize.json`.

The final complete `tank:anatomy:check` passes for all 201 vehicles and 603
technical diagrams. Its module sweep reports zero failures and zero modules
outside the envelope; 88 inherited dimension-drift warnings remain visible.
The final Borsuk/CV90 asset check passes all nine views, metadata and bores.

## Main integration

Rebased onto `9a224d6ac`, retaining the new lunar/bridge maps, role balancing,
menu changes and 33-battlefield count. Both factory entry points run role tuning
and the owner size policy. Marder 2 joins the new role table as support with a
440 m view range and 0.250/0.190 stationary/moving base concealment.

The twenty focused integration entries all pass across the integration run and
the two corrected receipt reruns. The latter preserve main's intentional role
handling differences: the donor digest changed only in 124 traverse, aim,
accuracy and movement-bloom scalars; the second-wave test still compares the
complete weapon payload and firing bloom. The post-rebase 21-ID assets/bores,
type check and public build pass. Logs: `main-integration.{json,log}` and
`post-rebase-receipts.log` under the same ignored evidence directory.

The separate Sheridan contact repair is retained locally pending its own
publication decision; it is not covered by either legacy source exception.
