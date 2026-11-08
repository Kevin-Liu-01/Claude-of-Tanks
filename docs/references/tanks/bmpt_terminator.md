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

Round 5 (2026-11-01, after blind critics on round 4 named the Ataka pairs first): each Ataka arm is a solid armoured
housing wrapping its tube pair's rear half, the tubes thicker and further apart; by the owner's ruling the bow AG-17D
housings and the mirrors on them are left off, the front fenders clean; round 4's open module rear kept; see "Round log".

- Hull (photos 03-09, 13-15): the fleet's T-72 X hull built in place by its own builder (`t72b3mX.ts`
  `buildT72B3MXHull`, `glacisContainers: false`, `glacisLamps: false`, and two default-off options added in 267:
  `roundedFrontGuards: false` leaves out the T-72B3M's rounded front mudguards, `openSkirtSpans` leaves the left
  skirt's cassettes out over the engine bay; the T-72B3M builds are unchanged, digest-proven). Added in
  `profiles/bmptTerminator.ts`:
  - Kontakt-5 on the glacis (03-06): two rows of two large wedges a side, one row on each glacis plane, each 30 mm off
    the cover at its rear and 110 mm at its blunt front edge (a saw-tooth in side view), two lifting bolts on each lid,
    hex heads along the lower row's toe, ERA furniture of the cover's own clusters; the two headlights in guards at the
    upper corners; a row of towing and plough brackets with two tow hooks on the lower nose (03, 06).
  - The front fenders (03-06, 13): over each, a solid sloped armoured hood flush beside the glacis (an inner cheek
    carried down to the glacis edge), its top falling from the side boxes' crown (1.80 m) to 1.43 m at its front, and a
    solid rounded nose carried down in front of the track to 0.94 m, 8 cm or more outside it round the idler; two bolt
    rows across the hood and a lifting eye near its rear. Nothing stands on it: the real Object 199 carries an AG-17D
    30 mm grenade launcher in an armoured housing on each front fender (photos 03-06, 13), with a rear-view mirror on
    each; the build leaves both off at the owner's ruling (round 5). The AG-17D were hull equipment only (no weapon row),
    so the combat data does not change; the two bow crew keep their stations and hatches.
  - The side boxes (07, 09, 14, 15): a third row of armoured boxes over the two skirt rows from the stern's end to the
    front fenders, top 1.80 m, flush with the skirt faces, the stern box down to the fender's end; handles and bolts.
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
    either side (the inner one on a pedestal on the deck) at the front below the left cannon, the commander's stowage box at the front right (10);
  - one compact rounded armoured body: a box-like lower part and on it the two cradle housings, their outer crown edges
    and fronts rounded off, joined into one by the cradle's own domed crown between them (1 cm off their inner faces,
    3.5 cm over their crowns, rounding down at the front with them); a block under the cradle's front and the mantlet's
    lower plate (gun frame) close the front between them (04, 07, 10). Behind the cradle between the humps (08): the
    stowage box with its carrying handle and latches at the top, 3 cm or more outside the receiver at every pitch; under
    it the breech opening, the receiver's back in it; at the bottom the block closing the space under the cradle, down to
    the ring and cut back inside the hull's clearances as the module turns (r 1.19 at its foot, r 1.27 up to 2 cm over
    the side boxes' crown);
  - the twin 2A42 in one cradle, each leaving the common rounded front in its own rounded canvas-bagged mantlet (a
    bulging twelve-sided bag with two tie straps, gathered to the collar), cylindrical multi-baffle muzzle brakes (10);
  - on the common trunnion through the humps, outside each, the hub and on it the Ataka launcher arm (07, 10, 12): the
    arm plate, round about the axis at its rear (r 0.30), as tall as the tube pair and a little more (y -0.33..0.28),
    carried forward to z 1.25; outside it the armoured housing that wraps the tube pair's rear half (z 0.30..1.25, out to
    x 1.085), its outer edges chamfered, its front's top edge set back, its underside rising forward, a bolted cover on its
    outer face, two lifting eyes on its crown, release levers at its front; the bolt circle and bearing nut on the plate
    behind it. The two open Ataka transport-launch tubes (r 0.09, one over the other) come out of its front, a spine and
    a quick-release clamp ahead of it (12); thicker rear sleeves, strap bands, end caps at both ends, the rear caps
    showing behind the housing (08); in the gun frame, so they elevate with the cannons;
  - the commander's panoramic sight on the right hump: square pedestal, collar, drum and the head with its big forward
    window (03, 04, 10); the meteo sensor's round housing (its "01" face aft) and tall post on the left hump (07, 08);
    two whips.
- Not modelled: the red end caps' colour (no red paint role in the bucket table); a nose-down stow of the tubes (the
  photographs show them level); the 2009 vehicle's mine plough.

## Datums

- Yaw axis (hull frame) [0, 1.5295, -0.40]; trunnion (turret frame) [0, 0.95, -0.90]; twin bores at x +-0.15, mouth face
  2.711 m ahead of the trunnion; Ataka tube axes (gun frame) x +-0.95, y +-0.155, r 0.09, from z 0.20 to 2.00, exits on
  the front caps at z 2.032. Humps x 0.19-0.72, crown 1.15, z -1.38..-0.21 (turret frame); cradle half-width 0.18,
  crown 0.235 over the trunnion; rear stowage box r 0.43 or more about the trunnion; Ataka arms x 0.775-1.085, z -0.30..1.25; base
  r 0.92, deck 0.16; every turret part under 1.82 m inside r 1.29 about the yaw axis. Front fenders (hull frame)
  x 1.106-2.005, hood top 1.80 at z 1.61 to 1.43 at z 3.42, nose to z 3.745.

## Combat data (src/vehicles/afvFamily.ts)

Spec clone of the T-72B3M (`t72b3m_2022`, the chassis family `bmpt_terminator2` clones), its turret's reactive plates
dropped (the station has none), its pivots, trunnion and barrel the station's. Between the BMPT-72 and the BMPT T-90, an
earlier standard than the T-90's: hp 2820 (2700 / 2950), V-92S2 1000 hp (published) on 47 t, 60/18 km/h, hull 33 and
turret 59 deg/s, cannons +45/-5; the twin 2A42 at 0.29 s, accuracy 0.265, aim 1.22 s; 3UBR8 APDS (123/111/99 mm, 51) and
3UOF8 HE-I (47) at 425 rounds each (the published 850); four 9M120-1 Ataka-T, one a tube, damage 520, 2.55 s. Installed
(after the fleet's balance passes, `afvBalance.selftest.mjs`): hp 2820, hull 31 and turret 62.5 deg/s, accuracy 0.273,
each between the BMPT-72's and the BMPT T-90's installed values (2700/2950, 32/30.1, 61.5/63.6, 0.278/0.268; penetration
125-112-100 / 122-110-98; Ataka 540/500). The real vehicle's two AG-17D are hull equipment only, as on `bmpt_t90`,
and the build leaves them off (the owner's ruling, round 5); the dims are the built envelope (overall 7.55 m to the
fenders' noses). Tier VI on the Russian support line (lane 13) off the BMPT-72, beside the
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
- Round 2 (r7): each of those; the T-72B3M builds untouched (default-off options). Checkpoint `2d3199bcae`.
- Critics on r7 split. Round 3 asks: the front fender boxes to stand proud like round 1's, solid sloped armoured boxes
  with the AG-17D on the sloped face, the mirrors back, a rounded lower nose instead of thin curled sheets; the module's
  humps joined into one compact body with the gap above the cradle filled and a distinct rounded bagged mantlet per
  cannon; if cheap, fewer and larger wedge Kontakt-5 modules.
- Round 3 (r8): each of those. Checkpoint `5854107fff`.
- Both blind critics put r8 over round 1 (confidence 4 each), one passes it. Named: the mirrors "thin flat panels on
  poles" that "look pasted on"; from the front the AG-17D housings "narrow, upright pods sitting on flat plain fender
  blocks", where the real ones are "broad sloped armoured boxes that fill the front corners down to the track guards";
  the Ataka arms want "armoured housings or arm bases where the tube pairs meet the module"; the module's rear (photo 08)
  to show the breech opening if the pocket census stays at 0.
- Round 4 (r9): each of those, as "What was built" describes. The opening: the stowage box above it is equipment (the
  census's rule: a box is open by design), the block under it carried to the ring; a first try left a slot under the
  body's rear overhang (520 cm2) and reached r 1.39 at the hull roof's height, which would have struck the side boxes
  as the module turned; both fixed, the fixture now holds the reach. Checkpoint `8efc3495cb`.
- Blind A/B r9 over r8 (both critics, confidence 3), both "fix", the same item first: each Ataka pair "slender tubes
  held by a small block", from the front and rear "small stacked discs beside the module", not the large armoured
  launcher arm of photos 07, 10 and 12.
- Round 5 (r10): the launcher arms as "What was built" describes. Measured on photos 10 and 12 against the 30 mm barrels
  (about 0.06 m at the brake) and the humps' width, the containers are about 0.18 m across their caps and their axes
  about 1.7 diameters apart: r 0.08 -> 0.09, axes y +-0.135 -> +-0.155 (x and the exits' z unchanged; the
  `fleetLauncherMuzzles.ts` row follows). (A bolted cover plate on the AG-17D housings' outer sides, the round's
  secondary item, went with the housings.)
- The owner's ruling for round 5, pointing at r9's front three-quarter view: "these two left and right things seem
  unnecessary", then "i mean those weird big machine gun blocks". Both sides: the AG-17D housings (box, ball mount,
  boot, barrel and sleeve, face bolts, side cover plates, sight window, crown plate and lifting eye) and the mirrors
  that stood on them removed; the fenders kept as the sloped hood and rounded nose, which carry on from the side boxes'
  crown. (A first reading of the ruling had lowered the operators' stations instead; that was undone, the stations are
  round 4's.) The overall length is now the stern cage to the fenders' noses, 7.55 m (was 7.67 to the AG-17D muzzles
  of rounds 1-2; rounds 3-4 already ended at the noses): `afvFamily.ts` dims overallLengthM, silhouetteHullLengthM and
  silhouetteOverallLengthM 7.67 -> 7.55; width 4.10 and height 3.44 unchanged.
- Round 5's census first found a 160 cm2 glazed recess under the gunner's sight's inner sensor, between the sight block
  and the commander's box: a marginal 4 cm slot from round 2 that the larger turret envelope's voxel grid now counted.
  The sensor stands on a pedestal on the deck; the census is 0.

## Evidence (2026-11-01, round 5, lane tree, uncommitted)

| Gate | Status | Command / artifact | Result |
| --- | --- | --- | --- |
| Typecheck | PASS | `node tools/typecheck.mjs` | TypeScript 7 clean, no unused symbols, oxlint clean |
| Fixture | PASS | `node src/vehicles/profiles/bmptTerminator.selftest.mjs` | pivots, bores, 4 gun-frame exits, 5 crew, 3.44 m crown, every turret part under 1.82 m inside r 1.29 about the yaw axis, high and low |
| Accessory contact | PASS | `IDS=bmpt_terminator node .qa-dev/contactprobe.mjs` | 0 floating, 0 clipping |
| Roof pockets | PASS | `node tools/roof-pocket-census.mjs --ids=bmpt_terminator` | none (round 4: the module's rear open under its stowage box; round 5: the gunner's inner sensor on a pedestal, see the round log) |
| Gun sweep (cannons and both Ataka housings over the hull) | PASS | `node tools/gun-depression-sweep.mjs --ids=bmpt_terminator --no-suit` | full -5 at every yaw, nothing blocked at +45, no mount conflict, no curve |
| Gun group over its own module | PASS | lane probe `.qa-dev/bmpt-terminator-gunturret.mjs` | 10 mm least: the cradle's sides beside the humps' inner faces (a lateral running gap parallel to the pitch axis); everything else 21 mm or more (the mantlet's lower plate over the closing block at -5), -5..+45, the axis seats excepted |
| Barrel circularity / axis | PASS | `measureTurretBarrelCircularity` | worst aspect 1.026, lateral 0 |
| ERA finish | PASS | the receipt's per-id assertions | glacis_era_L/R, skirt_era_L/R through the painted layered finish |
| Whole-fleet geometry digest | PASS | `geodigest-all.zsh` (`geodigest-bmpt-T-r10`) against `geodigest-bmpt-base` | 277 ids: only `bmpt_terminator` new and builder U's `bmpt_terminator2` moved |
| Receipts beside the changed files and naming the id | PASS | round 5: launcherOrigins, guidedLauncherTubes, recoilRig, afvBalance, t72b3mXGeometry, tacticalRoles, techTree, fleetParity, fleetOrder, tier, tankIdAliases, internalLayoutRegistry, decorationsEquipment, damagePanelMarkers, waterMobility (rounds 2-4 also t72b3mXSideMounts, nationalModernization, nationalUkraineProtection, nationWheelSets, the camo receipts, taxonomy, vehicleFacets) | |
| roofWeaponPolicy | red, not this id | | stops at `magach6b` (duplicate station names, the M60 lane's known red); this id's no-roof-gun row passes before it |
| crewSeats | OWED | regen | no combat-anatomy calibration for a new id until `tank:anatomy:update` |
| Photo route (stage A) | OWED | `tools/photo-reference-policy.mjs` | no packet registered (as `bmpt_t90`); a forced gate fails stage A until Main approves one |
