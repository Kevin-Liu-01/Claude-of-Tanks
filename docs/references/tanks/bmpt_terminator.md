# bmpt_terminator — BMPT Terminator (Ob'yekt 199 "Ramka", 2009-2013 standard)

## Current status

- Updated: 2026-11-01 (release 267, lane `item/bmpt-family-267`, builder T).
- Owner request: "love the bmpt t-90, but lets actually make a BMPT Terminator and a BMPT T-90 and then upgrade our BMPT
  T-72". The owner chose the original Ob'yekt 199 "Ramka" of the 2009-2013 standard (also Kazakhstan's), on the T-72
  chassis with Kontakt-5 and the bow grenade launchers; `bmpt_t90` (the 2018 serial, owner-ratified) stays as it is and
  `bmpt_terminator2` (the BMPT-72) is upgraded by builder U in the same lane.
- Id and names: `bmpt_terminator`, "BMPT Terminator" (short "Terminator"; aliases BMPT, Object 199, Ob'yekt 199, Ramka,
  Ramka-99, Terminator 1), nation Russia, era modern, role IFV; facets fire-support / support / service.
- Implementation: built and registered (see Registration). Qualification: photo-class, no 3D oracle (as `bmpt_t90` and
  `bmpt_terminator2`); numerical 3D comparison unverified. Publication: none (lane work, uncommitted at hand-off).
- Generated tables owed to the regen (not run in the lane): see "Generated tables a regen must fill".

## Sources (reference only; never shipped)

Wikimedia Commons, saved under `~/cot-lanes/bmpt-267-evidence/photos/terminator/` with `index.json`:

| # | File | Author | Licence | What it shows |
| --- | --- | --- | --- | --- |
| 01 | Bmpt_REA_2009.jpg | Nucl0id | CC BY-SA 3.0 | 2009 Russian Arms Expo vehicle, front left, mine plough |
| 02 | Bmpt_rearside_REA_2009.jpg | Nucl0id | CC BY-SA 3.0 | 2009 vehicle, right rear: module far aft, slat stern |
| 03-12 | BMPT_at_Engineering_Technologies_2012_(1)-(10).jpg | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012 vehicle: front (03, 04), front quarters (05, 06), left side (07), rear (08), right side (09), module front close-up (10), turntable (11), Ataka tubes (12) |
| 13-15 | БМПТ_Рамка_(1)-(3).JPG | Kalabaha1969 | CC0 | Kazakhstan, Astana parade 2015-05-07: crews in the hatches, hull number on the side boxes |

Published figures (en.wikipedia.org/wiki/BMPT_Terminator): 48 t, 7.2 m long, 3.37 m over the tracks and 3.8 m over the
screens, 1.94 m hull and 3.44 m overall height, crew 5, V-92S2 1000 hp, two 2A42 (850 rounds), four 9M120 Ataka (their
launchers elevate +25/-5), two AG-17D in the hull, a coaxial PKTM.

## What was built from which photograph

Round 2 (2026-11-01, after two blind photo critics on round 1, both "fix", reads-as "yes" / "partly"): the module is one
rounded body on a low base, the front fenders the AG-17D housings, the stern a close slat cage; see "Round log".

- Hull (photos 03-09, 13-15): the fleet's T-72 X hull built in place by its own builder (`t72b3mX.ts`
  `buildT72B3MXHull`, `glacisContainers: false`, `glacisLamps: false`, and two default-off options added in 267:
  `roundedFrontGuards: false` leaves out the T-72B3M's rounded front mudguards, `openSkirtSpans` leaves the left
  skirt's cassettes out over the engine bay; the T-72B3M builds are unchanged, digest-proven). Added in
  `profiles/bmptTerminator.ts`:
  - Kontakt-5 on the glacis (03, 04, 06): four rows of three flat modules a side, 55 mm over the bare cover, bolted along
    the front row's toe, ERA furniture of the cover's own clusters; the two headlights in guards at the upper corners;
    a row of towing and plough brackets with two tow hooks on the lower nose (03, 06).
  - The front fender housings (03-06, 13): a massive sloped armoured box over each front fender, flush beside the
    glacis (an inner cheek carried down to the glacis edge), its crown falling forward from the side boxes, its face
    sloped back and continued down as a 5 cm lip in front of the track; each AG-17D's ball mount in a collar inboard and
    low on the face, its 30 mm barrel forward, the operator's small sight window beside it.
  - The side boxes (07, 09, 14, 15): a third row of armoured boxes over the two skirt rows from the stern's end to the
    fender housings, top 1.80 m, flush with the skirt faces, the stern box down to the fender's end; handles and bolts.
    The right skirt's two open rail fields closed by containers of the same rows (the photographs' skirt runs unbroken).
  - The slat section in the left skirt over the engine bay (07): eleven horizontal flat bars on four posts, the wheels
    showing through, the skirt's cassettes of that run left out.
  - The bow crew stations (05, 06, 13): the two grenade-launcher operators' raised stations either side of the
    driver's hatch, each with its periscope housing and round hatch.
  - The stern (08): a cage of twelve horizontal flat slats with depth on five posts and a frame, 7 cm off the hull's rear
    leaves and braced to them; the two tow cables from eyes on the stern boxes across the cage's top and down its far
    sides; lugs and a stiffener on the lower rear plate; the stern closures (the wedge between each rear fender's run and
    its rubber leaf out to the stern box's face, the slot between the unditching log and the lower stern plate).
- Module (`profiles/bmptTerminatorStation.ts`; photos 04, 07, 08, 10-15) on its own ring 0.51 m aft of the T-72's (the
  side views stand the module over the rearmost road wheels):
  - a low compact base (r 0.92, 16 cm) with vision blocks round its front quarters (15); on it the commander's and
    gunner's hatches (13, 15), the gunner's big square armoured sight block with its large window and a round sensor
    either side at the front below the left cannon, the commander's stowage box at the front right (10);
  - one compact rounded armoured body: a box-like lower part and on it two rounded humps (the cradle housings), their
    crowns and fronts rounded off, close either side of the cradle; the cradle and a block under its front close the
    space between them, the breech swinging down behind it, open only to the rear (04, 07, 08, 10);
  - the twin 2A42 in one cradle, each in its own canvas-bagged mantlet, cylindrical multi-baffle muzzle brakes (10);
  - on the common trunnion through the humps, outside each, a compact trunnion housing at tube height carrying two open
    Ataka transport-launch tubes one over the other on a spine with two quick-release clamps (07, 10, 12); thicker rear
    sleeves, strap bands, end caps at both ends; in the gun frame, so they elevate with the cannons;
  - the commander's panoramic sight on the right hump: square pedestal, collar, drum and the head with its big forward
    window (03, 04, 10); the meteo sensor's round housing (its "01" face aft) and tall post on the left hump (07, 08);
    two whips.
- Not modelled: the red end caps' colour (no red paint role in the bucket table); a nose-down stow of the tubes (the
  photographs show them level); the 2009 vehicle's mine plough.

## Datums

- Yaw axis (hull frame) [0, 1.5295, -0.40]; trunnion (turret frame) [0, 0.95, -0.90]; twin bores at x +-0.15, mouth face
  2.711 m ahead of the trunnion; Ataka tube axes (gun frame) x +-0.95, y +-0.135, r 0.08, from z 0.20 to 2.00, exits on
  the front caps at z 2.032. Humps x 0.19-0.72, crown 1.15, z -1.38..-0.21 (turret frame); base r 0.92, deck 0.16.

## Combat data (src/vehicles/afvFamily.ts)

Spec clone of the T-72B3M (`t72b3m_2022`, the chassis family `bmpt_terminator2` clones), its turret's reactive plates
dropped (the station has none), its pivots, trunnion and barrel the station's. Between the BMPT-72 and the BMPT T-90, an
earlier standard than the T-90's: hp 2820 (2700 / 2950), V-92S2 1000 hp (published) on 47 t, 60/18 km/h, hull 33 and
turret 59 deg/s, cannons +45/-5; the twin 2A42 at 0.29 s, accuracy 0.265, aim 1.22 s; 3UBR8 APDS (123/111/99 mm, 51) and
3UOF8 HE-I (47) at 425 rounds each (the published 850); four 9M120-1 Ataka-T, one a tube, damage 520, 2.55 s. Installed
(after the fleet's balance passes, `afvBalance.selftest.mjs`): hp 2820, hull 31 and turret 62.5 deg/s, accuracy 0.273,
each between the BMPT-72's and the BMPT T-90's installed values (2700/2950, 32/30.1, 61.5/63.6, 0.278/0.268; penetration
125-112-100 / 122-110-98; Ataka 540/500). The AG-17D
are hull equipment only, as on `bmpt_t90`. Tier VI on the Russian support line (lane 13) off the BMPT-72, beside the
BMPT T-90. Factory coat: the Engineering Technologies 2012 three-tone (`paint_bmpt_terminator`, "Russian Three-Tone
Desert", appended after 266's catalog). No decor overlay (the photographed vehicles carry no field cargo).

## Registration

`afvFamily.ts` (spec row), `profiles/afvFamily.ts` (the build line), `fleetManifest.ts` (afv group), `taxonomy.ts`
(modern), `vehicleFacets.ts` (fire-support, support, service), `tankLabels.ts`, `roleProfiles.ts` (armored-support 410 m),
`internalLayoutRegistry.ts` (bmptFive), `fleetLauncherMuzzles.ts`, `nationWheelSets.ts` (T-90M wheel exception, as the
other BMPTs), `roofWeaponPolicy.ts` (no roof gun), `vehicleMarkings.ts` (the side boxes, right), `camoPolicy.ts` and
`authoredPaintCatalog.ts` (generated) with the i18n labels, `decorations.ts` (no overlay), `techTree/nations/russia.ts`
and `techTree/tiers.ts` (VI), and their receipts' pins (techTree, tacticalRoles, camo indices, nationWheelSets).
Shared builders extended, not changed: `bmptT90Station.ts` exports `hull`; `t72b3mX.ts` `buildT72B3MXHull` takes two
default-off options (`roundedFrontGuards`, `openSkirtSpans`), its default output byte-identical (whole-fleet digest).

## Generated tables a regen must fill

Tank assets (icons, hero, the asset row `public/icons/tank-assets/tanks/bmpt_terminator.json`), combat anatomy
(`combatAnatomyGroups`, the calibrations incl. the turret ring receipt the seat reads), sim floors
(`docs/geometry-gate/sim-floors.json`), interior fills, crew and mission seats (`missionAttachmentSeats`,
`missionDockSeats`), vehicle marking seats, presentation anchors (centering), riding parts, auxiliary inventory and the
garage auxiliary summary, nation index, the fleet-geometry ledger and gun-junction rows, the roof-pocket ledger row, the
spare-track placement row, the technical diagrams and the camo production baseline rows.

## Round log

- Round 1 (r6): the T-72 X hull with Kontakt-5 modules, side boxes, bow stations and corner AG-17D pods with mirrors; the
  Ramka as two flat-sided uprights on a large round drum, box muzzle tips, tall L-shaped Ataka arm plates; the 2022 kit's
  stand-off stern slat.
- Two blind photo critics on r6 (the coordinator's packet `~/cot-lanes/blind-ab-267/terminator`): both "fix"; reads as
  the Terminator "yes" / "partly". Named, in order: the module "two tall slim flat-sided pillars on an oversized round
  drum" with "a recessed black slot between them"; the front fenders "thin curved scoops" with a "scythe-like horn", the
  AG-17D "upright cubes", the mirrors "small black signs on stalks"; the stern screen standing off "about 0.6 m on thin
  rails" with "two flat oval outlines"; the cannons' box tips; the tall arm fins; the glacis field, the lower nose and the
  rear skirt's dark gaps.
- Round 2 (r7): each of those, as "What was built" describes; the T-72B3M builds untouched (default-off options).

## Evidence (2026-11-01, round 2, lane tree, uncommitted)

| Gate | Status | Command / artifact | Result |
| --- | --- | --- | --- |
| Typecheck | PASS | `node tools/typecheck.mjs` | TypeScript clean, no unused symbols, oxlint clean |
| Fixture | PASS | `node src/vehicles/profiles/bmptTerminator.selftest.mjs` | pivots, bores, 4 gun-frame exits, 5 crew, 3.44 m crown, high and low |
| Accessory contact | PASS | `IDS=bmpt_terminator node .qa-dev/contactprobe.mjs` | 0 floating, 0 clipping |
| Roof pockets | PASS | `node tools/roof-pocket-census.mjs --ids=bmpt_terminator` | none |
| Gun sweep (cannons and both Ataka housings over the hull) | PASS | `node tools/gun-depression-sweep.mjs --ids=bmpt_terminator --no-suit` | full -5 at every yaw, nothing blocked at +45, no mount conflict, no curve |
| Gun group over its own module | PASS | lane probe `.qa-dev/bmpt-terminator-gunturret.mjs` | 25 mm least (the cradle's sides to the humps) over -5..+45, the axis seats excepted |
| Barrel circularity / axis | PASS | `measureTurretBarrelCircularity` | worst aspect 1.026, lateral 0 |
| ERA finish | PASS | the receipt's per-id assertions | glacis_era_L/R, skirt_era_L/R through the painted layered finish |
| Whole-fleet geometry digest | PASS | `geodigest-all.zsh` (`geodigest-bmpt-T-r7`) against `geodigest-bmpt-base` | only `bmpt_terminator` new and builder U's `bmpt_terminator2` moved; the T-72B3M builds (and every national id on that hull) unchanged |
| Receipts beside the changed files and naming the id | PASS | t72b3mXGeometry, t72b3mXSideMounts, nationalModernization, nationalUkraineProtection, afvBalance, recoilRig, guidedLauncherTubes, launcherOrigins, nationWheelSets, camoCatalogProductionIndices, camoPolicy, authoredPaintCatalog, factoryCamo, techTree, tacticalRoles, taxonomy, vehicleFacets, internalLayoutRegistry, tier, fleetOrder, fleetParity, tankIdAliases | |
| roofWeaponPolicy | red, not this id | | stops at `magach6b` (duplicate station names, the M60 lane's known red); this id's no-roof-gun row passes before it |
| crewSeats | OWED | regen | no combat-anatomy calibration for a new id until `tank:anatomy:update` |
| Photo route (stage A) | OWED | `tools/photo-reference-policy.mjs` | no packet registered (as `bmpt_t90`); a forced gate fails stage A until Main approves one |
