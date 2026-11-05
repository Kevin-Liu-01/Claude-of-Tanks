# M163 VADS (`m163_vads`) — reference packet

## Current status (release 269, 2026-11-04): a new US air-defence gun

The owner, 2026-11-04: "also add the m163 VADS", built on the South Africa/Australia session's M113 work ("been working on
m113s to supply base models"), then "that m163 literally has a gatling gun/minigun on its turret so itll be so fun to have
in game and play around with". The US Army's M163 Vulcan Air Defense System: the M157 mount's open one-man turret and its
20 mm M168 Vulcan on the M741, a modified M113A1. Tier IV in the United States tree's special lane, after the M113A3 (a
special has no parents; a 20 mm gun a tier under the 35 mm Gepard at V).

- Build: `src/vehicles/profiles/m163.ts` on the M113 builder's hull (`profiles/m113.ts` `buildM113HullSteps(P, 'm741')`,
  the other session's; datums `m741Datums.ts`), the turret and gun from `profiles/m163Frame.ts`, which the spec reads too.
- Spec: `src/vehicles/m163Specs.ts`, a clone of the US M113A3 (`usaM113Specs.ts`) for the M113's hull armour, driver
  and automotive character; `synchronizeM163Frame()` runs from `fleetRegistration.ts` after the 269 air-defence hooks.
- The spin: `src/vehicles/gunRotorSpin.ts`, a generic presentation-only owner the visual's runtime
  (`tankFactoryCore.ts` `createTankRuntimeSteps`) kicks from `recoilKick` and advances on the recoil stroke's fx-clock
  step. The builder groups the six barrels and their clamps in one rotor (`userData.gunRotor = { barrels: 6, cycleS }`)
  about the bore.
- Fixture: `src/vehicles/profiles/m163.selftest.mjs`; the owner: `src/vehicles/gunRotorSpin.selftest.mjs`; the rotary
  block in `src/vehicles/recoilRig.selftest.mjs`.

## Sources

| Key | Source |
|---|---|
| WP | https://en.wikipedia.org/wiki/M163_VADS (12,310 kg for the A1, 4.86 x 2.85 x 2.90 m, crew 4: commander, gunner, loader, driver; the 6V53 of 212 hp, 64 km/h; -5 to +80 degrees; 3,000 rounds/min in 10-, 30-, 60- or 100-round bursts, 1,000 rounds/min continuous; the AN/VPS-2 range-only radar; the M61 lead-computing sight) |
| WPV | https://en.wikipedia.org/wiki/M61_Vulcan (1.827 m long, six 1.52 m barrels; the M53 API and the M56 HEI at 1,030 m/s) |
| IMA | ima-usa.com, an M61A1 muzzle clamp: 5.25 in (0.133 m) across |
| MP | https://www.militaryperiscope.com/weapons/ground-combat-vehicles/air-defense/m163-vulcan/ ("VPS-2 radar on the right") |
| AFV | https://afvdatabase.com/usa/m163.html (the gunner in the turret, the commander in the hull's right rear) |
| Photos | `~/cot-lanes/twin-aa-269-evidence/photos/m163/` (Commons; licences in its `index.json`): 00/03 the owner's right-front quarter (NTC 1988), 01/06 right front, 02 the gun close up (M163A1, 1992), 04 the left side (Desert Shield), 05 the front (REFORGER 85), 07 the rear and 08 the gun from the left (a museum vehicle), 09 a museum vehicle, 10 the autotrack turret drawing |

## The numbers (turret-local: the race's centre at the roof, +z forward, +x the vehicle's left)

r2 (2026-11-04) after a blind photo critic of r1 (6/10); r3 after a fresh critic of r2 (r2 won the blind A/B 9/9). Each
read checked against the photographs.

| Part | Number | From |
|---|---|---|
| race | 1.40 m, its centre 1.95 m ahead of the stern, top 0.04 m over the roof | `m741Datums.ts` (the hull's builder) |
| ring | 1.49 m across, deck 0.20 m over the roof, six slots in its side | photo 09 (the low slotted ring) |
| gunner's column | an open tub 0.90 m across, 0.54 m over the deck (rim 0.74 m), centred 0.16 m right and 0.44 m back of the race's centre | photos 07 (from astern: the round body just right of centre), 08, 09 (behind the gun) |
| box shield | r3: square to the hull against the column's left side and running aft past it, an open-topped box 0.32-0.78 m over the roof (85 % of the column's 0.54 m over the deck, its top 4 cm over the rim; its foot 3.8 cm over the hull's beacon as the turret turns): its flat inner face 3 cm into the column's wall (x 0.255), its outer face at x 0.72 (foot) to 0.80 (top), its ends at z -0.36/-1.12 (foot) and -0.27/-1.25 (top), so 0.76-0.98 m long and 0.47-0.55 m wide, the outer face and ends leaning out | photos 07 (its narrow end from astern), 08 (one broad flared face from the left), 09 |
| tall plate | 0.15 x 0.70 m at the column's right, carrying the radar's arm | photos 00/03, 06 |
| whips | r3: two `FITTINGS.antennaWhip` (a 0.12 m pot, a 2.40 m rod: 2.51 m from foot to tip, raked 6 degrees out), the left one on the box shield's top at its rear outer corner (0.68, -1.14), the right one on a bracket off the column's rear right wall (-0.42, -0.89, 0.66 m up); both on the turret, 0.7 m and more behind anything the gun sweeps; out of the body height (`tools/body-height-parts.mjs`) | photos 03, 04 (two whips about 2.5 m tall rising from the turret's rear, one each side) |
| trunnion | x +0.32 (left), 0.58 m up, 0.30 m ahead of the race's centre | photo 04: at 20 degrees the tips 1.95 m ahead of the race's centre and 1.18 m over the roof, the feeder 0.41 m ahead and 0.72 m up |
| Vulcan | six barrels 1.52 m on a 0.104 m circle, 31-37 mm across, bored 45 mm deep; the tips 1.66 m out; the mid clamp 30 % along from the breeches (0.57-0.63 m), the muzzle clamp (0.133 m, 7 cm deep) 0.12 m short of the tips; their spindle the fire axis's mouth at 1.655 m; the rotor housing 0.236 m across, 0.46 m long, its drive behind | WPV, IMA, photos 02, 04, 08 |
| under the housing | r3: a cylinder 0.09 m across (0.64 of the cluster's 0.14 m) pointing forward from 0.03 m behind the trunnion to 0.47 m (0.50 m long, a third of the barrels), its nose ring | photos 03, 04 |
| lamp | 0.15 m across on the mount's top | photo 06 |
| feed | the linkless drum in the hull under the turret (1,100 ready rounds, the 1,000 stowed beside it); r3: a thick segmented chute 0.12 m across (0.85 of the cluster), a rib 1.2 cm proud every 4.5 cm, from the inboard trunnion's feed joint up aft of the housing and forward over it (its arch 0.38 m over the axis, 0.42 m fore and aft, its rear inside 0.38 m of the axis so it clears the column's front at every elevation) down into the feeder | photos 08, 10 |
| radar | the AN/VPS-2's round housing 0.56 m across, centred 0.88 m over the roof at (-0.90, -0.56), outboard of the ring's edge on a horizontal arm and brace from the tall plate; r3: its dome looking forward along the gun, its flat round back plate (0.58 m) square across the turret's rear with a stub aft, two upright cases (0.13 x 0.56 m) left and right on the back plate's edges (photo 07: the round plate facing straight aft; 01, 06: a case at the housing's rear edge in side view; 10: the round face forward; 03 at 45 degrees fits either). Top 1.16 m over the roof: 3.02 m overall, 4 % over the published 2.90 m (115 in) that the photographs' radar (01: ~0.6 m across, top ~1.3 m up) overtops | MP, photos 01, 03, 06, 07, 10 |
| gunner | the seat in the column; the sight head 0.20 x 0.20 x 0.30 m on a post on the column's front rim, its top 1.10 m over the roof, above the breech and inboard of the gun's sweep | photos 00/01, 06 |
| roll bar | one tube rising 0.4 m at the mount's front, bending back, level at the gunner's shoulder (0.99 m) to the column's rim, inboard of the gun's sweep | photos 02, 04, 08 |
| hull kit | the long stowage case across the roof's left rear (0.90 x 0.24 x 0.36 m), the amber beacon at the right front | photo 03 |

## Gap table

| # | Photo read | Built |
|---|---|---|
| 1 | the M113A1 hull, the trim vane, five road wheels, the race where the cargo hatch was, the commander's round hatch at the right rear; no hull whip | the M113 builder's M741 (`buildM113HullSteps(P, 'm741')`) |
| 2 | the gun on the turret's left, the radar on the right rear (photos 04 from the left and 07 from astern, and MP) | gun left, radar right rear, outboard |
| 3 | a low ring, an open gunner's column at its rear right, a box shield square to the hull on the column's left running aft past it, the ring's front and the gun's side open (04, 07, 08, 09) | r2: ring, column, box shield, tall plate (r1 drew one tub round the whole ring); r3: the box square to the hull |
| 4 | six barrels in a cluster, the mid clamp near the breeches and the muzzle clamp short of the tips (02, 08) | the six bored tubes, both clamps with their bolt bosses and a spindle, on the rotor |
| 5 | the rotor housing and drive, the feeder on top, the thick segmented chute arching over it, the fat cylinder under it, a round lamp on top (00, 01, 03, 04, 06, 08, 10) | all of them (r3: the chute and cylinder thicker) |
| 5a | two tall whips at the turret's rear, one each side (03, 04) | r3: both, on the turret |
| 6 | the radar's ball ~0.6 m across high at the rear right on its arm, its round face forward and a flat round plate aft, two upright cases either side of the plate (01, 03, 06, 07, 10) | r3: the housing outboard on its arm and brace, its dome forward, its back plate and stub aft, the cases left and right |
| 7 | the gunner in his column behind his boxy sight head on a post, a tubular rail before him (00-04, 06, 10) | seat, sight head and hood, roll bar |
| 8 | the long case on the roof's rear, the amber beacon at the front right (03) | both |
| 9 | the 24th Infantry Division's desert sand (03), "A-21" on the trim vane | the US desert Factory coat (`service_usa_desert`); marking number A21 |

## Combat

- One gun, 20 mm, -5 to +80 degrees; the turret 60 degrees a second (66 after the recon doctrine), the gun 45.
- The game's floor is a 0.05 s cycle, so the cycle is the real gun's 1,000 rounds a minute (0.06 s); the burst limiter's
  60-round setting is the magazine (`gun.autoloader`: 60 rounds, 0.06 s apart, 4.0 s to reset): 3.5 s of fire, 1,200
  damage at ~340 a second (the 268/269 twin 35 mm: ~175), ~9,550 a minute sustained (the tier-V twin 35 mm: ~10,450).
- The M53 API: 20 damage, 90/72/55 mm at 100/1,000/2,000 m (a step over the Marder's 20 mm at II), 700 rounds; the M56
  HEI: 22 damage, 8 mm, 1,400 rounds (2,100: 1,100 ready, 1,000 stowed).
- 1,750 HP on the M113's aluminium hull; 12.31 t, 212 hp, 64 km/h.
- Crew 4: the driver front left, the gunner in his column, the commander under his hatch at the right rear, the loader
  opposite him (`internalLayoutRegistry.ts` `spaaM163`); the ammunition in the hull under the turret.
- Report: each shot raises `shell:fired` (`src/game/state.ts` `emitShellFired`) with `weaponSound` 'rh202' (the fleet's
  20 mm report, a stand-in), caliber 20, the round's name, every 0.06 s through a burst: a rotary-cannon report (and a
  spin-up/coast-down whine) is the sound lane's.

## Owed

- The changed-only regeneration (combat anatomy, marking seats, interior fills, hero card, technical diagrams) is the
  coordinator's; until it runs the lazy loader rejects the group, as for the six 269 air-defence ids.
- A photo packet (`tools/photo-reference-policy.mjs`), as the 269 air-defence ids have none either.
- (Resolved for r2: the M741 carries no hull whip, item/m113-hull-269 19c0acad47; the gun's sweep clears the hull with no
  exception.)
- The hull's rear lower corner boxes (photo 07: two boxes standing aft at the rear plate's bottom corners over the
  tracks, about track width, ~40 % of the rear plate's height, sloped tops, lamp openings) are the M113 builder's; the
  M741 draws only the small tail-light boxes high on the rear plate. Asked of the hull session (r3 report).
