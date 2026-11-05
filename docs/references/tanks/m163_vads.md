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

| Part | Number | From |
|---|---|---|
| race | 1.40 m, its centre 1.95 m ahead of the stern, top 0.04 m over the roof | `m741Datums.ts` (the hull's builder) |
| drum | 1.49 m across, deck 0.25 m over the roof | photos 03, 08 (the low drum on the race) |
| trunnion | x +0.32 (left), 0.58 m up, 0.30 m ahead of the race's centre | photo 04: at 20 degrees the tips 1.95 m ahead of the race's centre and 1.18 m over the roof, the feeder 0.41 m ahead and 0.72 m up |
| Vulcan | six barrels 1.52 m on a 0.104 m circle, 31-37 mm across, bored 45 mm deep; the tips 1.66 m out, 4 cm proud of the muzzle clamp (0.133 m, 8 cm deep); the mid clamp at 0.88-0.94 m; the rotor housing 0.236 m across, 0.46 m long, its drive behind; the fire axis's mouth the clamp hub's face at 1.655 m | WPV, IMA, photos 02, 04, 08 |
| drum (ammunition) | 0.40 m across at (+0.30, -0.38), top 0.74 m, the rest in the basket; its linkless chute into the inboard trunnion | photos 07, 08 (the round body behind the gun, the ribbed chute) |
| radar | the AN/VPS-2's round housing 0.44 m across at (-0.50, 0.80, -0.48), the dish forward, two upright cases either side 0.28 m out whose tops make the published 2.90 m | MP, photos 01, 03, 06, 07 |
| shields | 12 mm steel arcs at 0.785 m: the left one 75-165 degrees to 0.80 m, the right one -75 to -15 degrees to 0.66 m | photos 04, 07, 08 (the tall curved box on the left rear), 01, 03 |
| gunner | the seat at (-0.08, 0.52, -0.12), the sight on its post at (-0.10, 0.84, 0.14), the hand rail arching over his front | photos 01, 02, 03, 04, 10 |
| hull kit | the long stowage case across the roof's left rear (0.90 x 0.24 x 0.36 m), the amber beacon at the right front | photo 03 |

## Gap table

| # | Photo read | Built |
|---|---|---|
| 1 | the M113A1 hull, the trim vane, five road wheels, the race where the cargo hatch was, the commander's round hatch at the right rear | the M113 builder's M741 (`buildM113HullSteps(P, 'm741')`) |
| 2 | the gun on the turret's left, the radar on the right rear (the brief said the reverse; photos 04 from the left and 07 from astern, and MP, put the radar on the right) | gun left, radar right rear |
| 3 | six barrels in a cluster, a mid clamp and a muzzle clamp, the tips proud of it | the six bored tubes, both clamps with their bolt bosses and a hub, on the rotor |
| 4 | the rotor housing and drive, the feeder on top, the chute coiling in, a lamp on the gun | housing, drive, feeder, the chute through the inboard trunnion, the lamp on its bracket |
| 5 | the round body behind the gun (photo 07), the tall curved shield round the left rear (04, 07, 08) | the ammunition drum and the left shield |
| 6 | the radar's ball with its flat face, two upright cases flanking it (01, 03, 06) | the housing on its yoke and post, the dish and horn, the cases on arms |
| 7 | the gunner high in the open mount behind his sight, a tubular rail before him (01-04, 10) | seat, sight with its glasses, the hand rail |
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
- Crew 4: the driver front left, the gunner in the mount, the commander under his hatch at the right rear, the loader
  opposite him (`internalLayoutRegistry.ts` `spaaM163`).
- Report: each shot raises `shell:fired` (`src/game/state.ts` `emitShellFired`) with `weaponSound` 'rh202' (the fleet's
  20 mm report, a stand-in), caliber 20, the round's name, every 0.06 s through a burst: a rotary-cannon report (and a
  spin-up/coast-down whine) is the sound lane's.

## Owed

- The M741's left-rear whip (`profiles/m113.ts`, the hull's builder's) stands 1.90 m from the race's axis, inside the
  Vulcan's 1.99 m reach: the barrels pass through it round yaw 140 at every pitch under ~75 degrees (pinned in the
  fixture). The M163's antennas stand on its turret (photos 03, 04): the M741 without the hull whip, or the whip at least
  2.05 m from the race's axis, is the hull builder's.
- The changed-only regeneration (combat anatomy, marking seats, interior fills, hero card, technical diagrams) is the
  coordinator's; until it runs the lazy loader rejects the group, as for the six 269 air-defence ids.
- A photo packet (`tools/photo-reference-policy.mjs`), as the 269 air-defence ids have none either.
