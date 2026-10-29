# Early production Leopard 2s (2A2, 2A3, 2A3 OTCO) — run packet

Template: `docs/tank-generation/templates/run-packet.md`. Lane `item/leo2a3-b4-262` (release 262), built on
`item/christian2-262`.

## Current status

- Updated: 2026-10-28.
- Owner requests (verbatim):
  - 2026-10-27, to the christian2-262 lane: "the new leo annd leo changes should rightfully be based on the new model and
    use totally new tank generation. the type 90 is a separate tank". Main's scope the same day: ONE new tank `leo2a3_b4`
    "Leopard 2A3" (the fourth batch) at tier IV with the then 2A3's combat data, on the same new first-party Leopard
    construction as the Christian II, `leo2a3` shown as the "Leopard 2A2 OTCO"; a 2A2 variant never above a 2A3.
  - 2026-10-28: "ehh make a new otco version, new leopard 2a2, new leopard 2a3, all based on our new leeopard 2. this will
    make things eeasier. make a nnnew 2a2 and 2 nnnew 2a3 variannts, one of which is the otco, and explore
    swapping/fitting leopard 4 hulls onto our new hull base, annnd explore updating the leopard 2 prototype too".
- IDs: `leo2a3_b4` "Leopard 2A3" (new, IV); `leo2a2` "Leopard 2A2" (rebuilt in place, III); `leo2a3` "Leopard 2A3 OTCO"
  (rebuilt in place, IV; shown as the "Leopard 2A2 OTCO" earlier in the release). Combat data stands on all three.
- Implementation status: built (profiles/leopard2a3B4.ts on profiles/leopard2Hull.ts; datums and armour in
  leopard2a3B4Armor.ts; specs leopard2a3B4Specs.ts).
- Explorations (reports in the lane's evidence, not shipped): the 2A4-family hulls on the new hull base; a prototype
  rebuild. The prototype's armour is pinned in leopard2ProtoArmor.ts so it no longer follows leo2a2's spec.
- Publication: lane branch; Main integrates.

## Scope and preservation

- Mode: new first-party builds of production vehicles on the release's shared Leopard 2-pattern construction (the
  Christian II concept model's measured Leopard 2 proportions, read for proportions only).
- Owned files: `src/vehicles/profiles/leopard2a3B4.ts`, `src/vehicles/leopard2a3B4Armor.ts`,
  `src/vehicles/leopard2a3B4Specs.ts`, `src/vehicles/leopard2ProtoArmor.ts`,
  `src/vehicles/profiles/leopard2a3B4.selftest.mjs`, this packet; the two hull options in `leopard2Hull.ts` (defaults
  leave the Christian II byte-identical); one registration line each in the shared tables; the OTCO's names.
- Retired: `src/vehicles/profiles/germany.ts` (the old OTCO wrapper over the old 2A2 build); the old 2A2's ghillie suit
  (its carriers are authored to the retired hull; `disabled`); `leo2a2`'s registration of `buildLeo2A4` in leopard.ts.
- Protected: the Christian II, the prototype and every other Leopard's specs and geometry (spec hashes and the fleet
  geometry ledger prove it).

## Construction

- Hull and running gear: `buildLeopard2Hull(P, { exhaust, foreSkirtDropM: 0.16, fuelFillers: true })`, the Christian II's
  construction with the production Leopard 2's deeper heavy fore skirt blocks (the photographed step) and the forward fuel
  tanks' filler caps; pressed louvre exhaust grilles on the 2A2, the fourth batch's round rods on the 2A3s.
- Turret (turret metres from the ring at (0, 1.64, 0.37)): the cheek blocks' faces at z 1.65 (hull z 2.02, over the
  driver's hatch) across from the 0.95 m gun slot to 1.20 m off the bore, swept back 6 degrees outward, vertical to 0.60 m
  and bevelled back to their tops, a short chamfer to the 1.27 m half-width walls (see "Turret front"), the walls to the
  step at z -1.62, the bustle 1.15 m half-width to its rear plate at z -2.64 (hull z -2.27; 0.86 m half-width), roof 0.66
  at the front rising to 0.83; the mantlet set 3 cm back in the slot with the coaxial MG3's port and the FERO Z18's
  aperture, a round boss on a bolted flange narrowing to the sleeve;
  the EMES 15 in its notch in the right cheek under its housing, the PERI R17 and the commander's low ring with eight periscopes (right), the loader's hatch and MG3 (left), the
  ammunition hatch on the left wall, two grab rails a side (none under the OTCO's shrouds), the eight dischargers a side
  in one block on a bracket at the bustle's rear corners, the radios' antenna bases, the rear basket; the L/44 with thermal sleeves and evacuator
  (trunnion (0, 0.36, 1.04), tube 4.29 m).
- The batches (Jerchel and Schnellbacher; en.wikipedia "Leopard 2"):
  - 2A2: the crosswind sensor's hole closed by a round plate, the ammunition hatch hinged and handled, the SEM 25/35's tall
    antenna bases, pressed exhaust louvres.
  - 2A3: no crosswind sensor (only the modernised first batch shows the plate), the ammunition hatch welded shut, the SEM
    80/90's short bases, round-rod exhaust grilles.
  - 2A3 OTCO: a fourth-batch 2A3 with the field modification: a bolted rim (0.16-0.27 m over the ring) round the
    turret's foot from 18 cm ahead of the cheeks round the corners and along the walls and bustle to the rear corners;
    four spaced shrouds a side standing on it from the cheek's corner to the step, leaning out 2 degrees, capped back to
    the wall; a tall barred cage off the bustle (four rails, barred sides); a second radio pair in four-post guard cages.
- Combat data: `leo2a3_b4` cloned from `leo2a3` (stats, gun, rounds, paint) with the 260 trims (cycle 6.4 s, turret front
  x0.9) applied beside it in fleetBalancePass; `leo2a2` and `leo2a3` keep theirs. All three carry the 2A2's basic armour
  package on the construction's drawn hull and turret (the first four batches share it).
- Stowage (the owner: "add a lot on our tanks"): the fleet's seven-piece field cargo plus curated loads: packs and rolls
  in the basket, tow cables down the hull's sides, tools and bins on the fenders, cans, rations and tarps on the engine
  deck, shackles on the bow; the OTCO the heaviest (five packs in its cage, a drape, drums and a can rack on the stern,
  track links on a shroud).

## Turret front (2026-10-28)

The owner: "the real leopards of these have cutouts in the front of turret for a window thing. I'm guessing 1 is for
coaxial machine gun but no idea on the other one (auxiliary gunner sight maybe ??) also note that the fronts of turret
are sloped a little instead of being flat on. update these. research and build it out." Reference: the owner's Austrian
2A4 (`~/cot-launch-state/streams/owner-shots/20261028-leopard2a4-turret-front-ref.webp`). The sources, measurements and
confidence levels are in the lane's note `~/cot-lanes/christian2-262-evidence/turret-front-sources.md`. Most dimensions are
photo estimates scaled from the 0.93 m mantlet (btvt/Militarysta, measured), the 635 mm track and the 3.70 m width; the
pre-2A5 front is the same from 2A0 to 2A4 (en.wikipedia: the 2A5 moved the sight "to the turret roof as opposed to the
cavity in the front armour in previous models").

- The two round ports are the coaxial MG3's (vehicle left, 0.31 m off the bore, 0.16 m over it: a 68 mm hole in a raised
  ring) and the FERO Z18 auxiliary sight's (vehicle right, 0.285 m off, at the bore: an 85 mm aperture in a 140 mm
  collar 45 mm proud, its lens back in the bore, its cap hanging on a chain), both in the mantlet and pitching with the
  gun. The 2A2's collar stands longer (about 0.12 m, an estimate: from the 2A3 the tube was shortened).
- The "window thing" is the EMES 15 gunner's sight in a notch in the right cheek's top inboard corner, open to the front
  and the top: walls 0.50 and 0.94 m right of the bore, sill 6 cm over the bore, the opening 0.33 m tall under the sight
  housing's front, about 0.22 m deep to the sight head, roofed by the housing's bolted lip 16 cm out over it; the head's
  thermal window outboard and its day and laser window inboard; two armoured door leaves hinged at the walls, swung
  forward flat against them (open).
- Over the mantlet (the owner's photo): the dark groove of its seal behind the mantlet's top, the rubber strip, and the
  bolted cover standing 4 cm over the brow from the sight housing to the left cheek, 0.30 m deep.
- The slope (the owner, 2026-10-28: "i dont think its that they need to lean back is that if you look top down, the
  chheeks are at a slight slope, like \ / but not extreme"; shown the two readings, the owner chose the outer ends set
  back: "A built now is correct"): the faces vertical, swept back 6 degrees toward their outer ends in plan, running
  nearly the turret's width (about 2.5 m), a short chamfer to the walls. No source publishes the plan angle
  (en.wikipedia: "vertically faced"; the research note: up to 5 degrees not ruled out by the photos).
- The face's place and its bevel (the 2A4 lane, 2026-10-28, Björn Huber's published 2A4 side drawing registered on this
  hull by road-wheel pitch; R2's critic had read the same 0.4 m): the faces stand at hull z 2.02, over the driver's hatch,
  0.38 m ahead of the earlier build's, the bustle's rear plate at hull z -2.27; the faces vertical to 0.60 m, then a bevel
  back 0.22 m to the cheeks' flat tops (the photographed 2A4 fronts; the owner to that lane: "fronts of leo 2a4s are
  sloped though"); the roof's front plates over them 70 mm (btvt).
- The mantlet: 0.93 m wide (btvt, measured), 0.20 m under the bore to 0.23 m over it at its face, its vertical edges
  bevelled 3 cm and its top one chamfer 0.22 m back up to the brow, where the seal runs (a lifting eye and two bolt heads
  on it; the gun's root one cone from the face, 0.47 m across, to the sleeve's bolted ring 0.26 m out: the owner's
  photo), set 3 cm back in the slot (R4's photo critic and the 2A4 lane's four photographed
  2A4s, the Croatian, Singapore, Slovak and Austrian, agree; the research note's 15 cm proud was a low-confidence
  estimate), with the dark gun-port recess under it; the trunnion and the muzzle stay where they were.
- The grab rails, round bars on standoff brackets across both cheek faces, the right one under the notch's sill (0.30 m)
  and the left one higher (0.37 m); a rubber-faced pad 0.40 by 0.10 m on the right face's foot under the notch; a shallow
  bolted panel on the left cheek's bevel (the owner's photo; the 2A4 lane's measures).
- Anatomy, what a round meets: through the notch, the sight head and the 660 mm block behind the cavity (about 0.6 of the
  cheek's line of sight under the sill; the 2A4 front's known weak spot), modelled as `turret_front_sight_notch` (linked
  to the optics) on the face the collision shell meets: the notch has its own lateral band and these turrets'
  cells are plate-fitted (`tools/gen-combat-anatomy.mjs` TURRET_LATERAL_CUTS; the 26-point support hull dropped the
  sill's edge), so the shell closes over the notch from the sill to the housing's top, and the plate carries the
  line-of-sight protection onto that slope. The mantlet's plate stands on the shell's slot face, where a round lands
  (the mantlet rides the gun mount, outside the shell; authored at its own face it squeezed every turret plate back). The ports are smaller than any round but a long-rod
  penetrator's and lie in the mantlet, so a round there meets the mantlet: they stay inside its plate. The 260 turret-front
  trim (x0.9) takes the notch with the cheeks on the 2A3s.

## Round log

- R1 (2026-10-27): first build on the shared hull. Blind critic 1 FAIL: the last skirt panel hid the sprocket (fixed in
  the shared hull: a fender strip over it); the bustle floor eased, whips plumb, the ammunition hatch a raised plate.
- R2 (critic 2 FAIL): the EMES 15 set into the right cheek, a broad mantlet with the FERO Z18 port, the front roof raised, a
  squat PERI; in the shared hull one exhaust band across the rear plate and a tubular stern rack for the stern box. Its
  "turret front 0.4 m too far back" is the reference's net-wrapped mantlet (the oracle's cheek faces are at 1.66 m, ours
  1.64 m).
- R3 (critic 3 FAIL): the mantlet 8 cm proud under a brow closing the slot, a roof bevel over the cheeks, the EMES housing
  with 20-degree sides and its window in front, two raised rows of dischargers, sloped bins, the PERI on the commander's
  ring; in the shared hull crossed tow cables, rack stays, the sponsons closed to the rear plate, a hinge boss and larger
  periscopes on the driver's hatch.
- R4 (2026-10-28, a blind critic against cited Bundeswehr photos, PLAUSIBLE 6/10; the photos on the owner's sheets): the
  dischargers moved from fanned banks mid-turret to one block of two rows of four at each bustle corner; the mantlet
  recessed 3 cm behind the cheeks with a round bolted boss narrowing to the sleeve (the photographed gun root); the EMES 15
  window made tall (0.26 x 0.30 m) in the cheek's face under its housing; the side bins dropped for two grab rails a side;
  the commander's ring lowered; the heavy fore skirt blocks hang 16 cm deeper than the aft run; the 2A3's crosswind mast
  removed (only the modernised first batch shows its plate). Turret length and barrel taper were low-confidence calls,
  left as built.
- R5 (2026-10-28, the owner's family order): `leo2a2` and `leo2a3` rebuilt in place on the construction, the batches told
  apart (see Construction). The OTCO keeps what made it special, redesigned for the new turret (the owner: "keep the rim
  thing around it that made it special (can redesign it tho) and the cages"): a bolted rim round the turret's foot from
  ahead of the cheeks to the bustle's rear corners, four shrouds a side standing on it, a tall barred cage off the bustle,
  the second radio pair in guard cages; no ghillie ("no need for otco to have ghillie"). All three go out loaded ("a lot
  of the equipment and decorations and stuff! add a lot on our tanks"): the fleet's field cargo plus curated loads. The
  old 2A2's ghillie suit, its receipts (leopard2A4Ghillie, leopard2A4GunSeat, leopard2A4SideSkirt) and the OTCO wrapper
  (profiles/germany.ts) retire; the anatomy's sim-floor moves for leo2a2 and leo2a3 recorded as intended.
- R6 (2026-10-28): Main's ruling on the OTCO's anatomy (its rim, shrouds and caps had widened every turret plate to the
  rim's edge: strength 0.527 against the 2A3's 0.284 on identical combat data): the kit rides turretEquipment, the OTCO's
  turret anatomy is the 2A3's (selftest §5), both 0.303. Then the owner's turret-front order (see "Turret front"): the
  ports, the sight notch, the faces swept back in plan (a first 3-degree lean-back withdrawn on the owner's word), the
  full-width bevelled front 0.38 m forward on the registered drawing, the bustle 9 cm shorter, the mantlet 3 cm back in
  the slot, the rails at a third of the faces' height (the 2A4 lane's photographed 2A4s), on all three.
- R7 (2026-10-29, a blind critic of the geometry renders against the owner's photo, FAIL; each finding checked against
  the photo at its own scale): the sight housing's lintel up 5 cm and its bolted lip out over the notch, the doors the
  opening's height; the mantlet's seal groove, rubber strip and raised cover over the brow; the pad on the right face's
  foot at the photo's 0.40 by 0.10 m; the FERO cap smaller, hanging toward the gun on a slanted chain. Two findings
  stood against the photo: the right rail's height matches it at the cheek's own scale, and the 2A3's "ledge" is the
  OTCO's rim (R5, the owner's). Critic round 2 FAIL on the mantlet (its top ran under a brow standing out like a
  visor): the top one chamfer up to the brow, the eye and bolts on it, the gun's root one cone, the left rail 7 cm
  higher than the right (the photo's close-up). Round 3 PASS; from its minor list, the sight's panes equal, the lip out
  past the outer wall, round rails on brackets, the panel on the left cheek's bevel, and a lug no photo shows removed.
  Left as built: wider cheeks and the notch 8 cm farther from the slot (both would move the armour; the cheek-to-mantlet
  ratio was read across parts at different distances from the camera), a rounded seal cover.
- Checks on the R5 build: ids-scoped chain PASS; leopard2a3B4.selftest PASS (worst gun clearance 26.3 mm at yaw -168;
  curve as measured, identical across the three sweeps); techTree, fleetBalance, camoPolicy, camoCatalogProductionIndices,
  authoredPaintCatalog, vehicleFacets, nationIndex, garageOrder, tankIdBoundaries, nationWheelSets PASS; typecheck clean.
  Capability score 0.511, as leo2a3's.
