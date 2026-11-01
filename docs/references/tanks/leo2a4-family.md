# The 2A4-era Leopard 2s on the release construction — run packet

Template: `docs/tank-generation/templates/run-packet.md`. Lane `item/leo2a4-family-264` (release 264), built on
`item/leo2a3-b4-262` (baseline `f5be27c999`).

## Current status

- Updated: 2026-10-29.
- Owner request (verbatim, 2026-10-28): "also see these new hulls for the 2a2 annd 2a3s! im realizing we really have to
  update and cleanup our old designs for leopard 2a4 otco, 2a4v, 2a4m, 2a4, 2a4m can, and leopard 2 improved off of thhast
  good hull and redesingn the turrets off of our leopard 2a6 and have them be the before variants basically. annd also
  carry over the unique additions and decorations annd eqquipment and props each of those have onto those new details."
  Mid-lane (2026-10-28): "hmm fronts of leo 2a4s are sloped thoughh. check the real tanks"; "we can still have 2a4s that
  use this squarish turret that doesnt look like 2a6, but it should be evenly split between the 2a4 squares vs 2a4 modern
  upgraded variants that look like 2a6s" ("excellent approved"); "oh yeah this meanns we nnneed to update the strv 121 as
  well".
- IDs (rebuilt in place, names and combat data unchanged): `leo2a4` Leopard 2A4, `leo2a4_v` Leopard 2A4 V, `leo2a4m`
  Leopard 2A4M, `leo2a4m_can` Leopard 2A4M CAN, `leo2a4_otco` Leopard 2A4 OTCO, `leo2_improved` Leopard 2 Improved.
- The Strv 121 (the owner, mid-lane): this branch, `item/strv121-2a4-265`, rebuilds it on the family's construction
  with the ghillie lane's re-seated suit (item/ghillie-strv121-265, fieldClearanceM 0.045; Main, 2026-10-29: the old
  seat read 18.84 mm from the suit's hull net at yaw 180) for the next release. The lane branch keeps its base build.
  Blind critic PASS (round 3, against a photographed Strv 121 and the 2A4 references); nationalGunClearance at every yaw
  (no skip window); fairness (IX round robin, 120 m) 0.882 (3/35 pairs in 0.2-0.8) -> 0.362 (17/35), no lever: the old
  build was the tier's second strongest.
- Implementation status: built; regen chain, gun stops, gun lines, rigs, seats, spare track and ledger green on the six.
- Qualification status: blind critics (SwiftShader Gallery stills, front34/side/rear34/front): PASS on all six
  (leo2a4m, leo2a4m_can, leo2_improved, leo2a4_v round 1; leo2a4_otco round 3; leo2a4 round 4). The lane release gate
  (2026-10-29) read B2 contiguity and sealed reds, fixed in R4; its stage A is the photo packets for the five
  unregistered ids (Main 2026-10-29) and the CAN's registered gate (an inherited red: main's own CAN reads min 0 fresh).
  module-visual-align is red as on the base's 262 family. The gates re-run after R4's regen chain.
  Fairness (VIII round robin, 120 m) before -> after: leo2a4 0.497 -> 0.468, leo2a4_v 0.724 -> 0.747, leo2a4m 0.842 ->
  0.909, leo2a4m_can 0.493 -> 0.474, leo2a4_otco 0.83 -> 0.911, leo2_improved 0.833 -> 0.915 (balanceMatchups 20/20).
- Publication: lane branch; Main integrates. Main (2026-10-29): the frozen 263+264 release ships without it; the six go
  in the next release with the early Leopards and the balance lane's lever for the wedge three (~0.91), and the Strv 121
  rebuild with its ghillie fix.

## Scope and preservation

- Mode: family rebuild on the release's shared construction; the turret derived from our source-measured Leopard 2A6
  (`profiles/leopardA6X.ts`) as its predecessor.
- Owned files: `src/vehicles/leopard2A4FamilyArmor.ts` (datums, envelope), `src/vehicles/leopard2A4FamilySpecs.ts`
  (re-envelope), `src/vehicles/profiles/leopard2A4Turret.ts`, `leopard2A4Family.ts`, `leopard2A4KitParts.ts`, the kits
  (`leopard2A4Kit.ts`, `leopard2A4VKit.ts`, `leopard2A4A5nlKit.ts`, `leopard2A4CanKit.ts`, `leopard2A4OtcoKit.ts`,
  `leopard2ImprovedKit.ts`, `leopard2A4Flw200.ts`), this packet; one registration line each in `fleetManifest.ts` (group
  `leopard2a4Family`), `fleetFactory.ts`, `profiledProcedurals.ts`, `fleetRegistration.ts`; the six rows leave
  `LEOPARD_PROFILES`.
- Protected: `leo2a6_ua` (its own session; `buildLeo2A6M` stays), the source-X studies `leo2a5`, `leo2a5m`, `leo2a6`,
  `leo2a6m`, `leo2a7v`, `strv122` (their combat copies are taken before the re-envelope), the 262 family (`leo2a2`,
  `leo2a3`, `leo2a3_b4`, `christian2`). `leopard2Hull.ts` takes one option from this lane (`skirts: 'none'`, default
  byte-identical) after the 262 turret-front head merged, and a second for the Strv 121 (`splashBoard: false`, default
  on). The strv121 ghillie suit row belongs to the ghillie session (its re-seat on this geometry is merged here).
- Combat data: every stat, gun and round, paint and every armour plate's protection (physical, KE, CE, kind, ERA, module
  link) stands under its own name; only where the plates stand moves (the 2A6/2A5 wedge and chevron layers become the
  spaced layer inside the 2A4 front block). Gun geometry: the L/44 on all six (leo2a4's old build drew a 2A6's L/55; the
  OTCO and the Improved drew their 2A6M and 2A7V records' L/55 until the owner's ruling via Main, 2026-10-29, R5).
  Combat changes, all R5 (Main rulings 2026-10-29): leo2_improved's APFSDS from the 2A7V record's L/55 891/811/730 mm to
  the L/44's 855/778/700 (the OTCO's already fired the L/44's figures); leo2a4m_can heightM 2.62 -> 2.75 m (the DND;
  tankBodyContacts and spotting read it). Published lengths: leo2a4 and leo2a4_otco 9.67 m, leo2_improved 9.97 m (the
  KWS II TVM).

## Sources (per id)

- The turret: our Leopard 2A6 X (`docs/references/tanks/leo2a6_x.md`: the owner-supplied `leopard_2_a6.glb`, SHA-256
  b98d8199…7477), its measured shell sections, hatch rings and smoke rows kept in its own z frame; registration on the
  release hull by Björn Huber's Leopard 2A4 side drawing (Wikimedia Commons `Leopard2A4.jpg`, CC BY-SA 3.0) scaled by the
  road-wheel pitch (165.2 px = 0.825 m): loader's hatch over the ring, front-block seam 0.51 m behind the faces, faces
  0.48 pitch behind the first road wheel (hull z 2.02), bustle rear 0.68 pitch behind the sixth (z -2.27). The 2A6 X's own
  yaw origin (z 1.05) is its modeller's. Overlay: lane evidence `proto1/overlay-huber.png`.
- The front (owner, mid-lane): Croatian Army 2A4 (`Leopard 2A4 HV.jpg`, CC BY-SA 4.0), Singapore Army 2A4 (`Leopard 2A4
  Singapore Airshow 2008 rectified.jpg`, CC BY-SA 4.0), the owner's Austrian 2A4 (owner-shots
  `20261028-leopard2a4-turret-front-ref.webp`), Slovak 2A4 (`Slovak Leopard2A4 on SIAF2023.jpg`, CC0): vertical faces to
  0.61 m, a bevel back to the roof over cheeks and mantlet, faceted corner cuts, a wide flat mantlet with the FERO Z18 and
  coaxial ports, the EMES 15 pocket with its doors, grab rails on the faces, spare links across the glacis nose.
  Published dimensions (Slovak MoD technical sheet): 9,670 mm gun forward, 3,750 mm wide, 2,790 mm to the PERI R 17.
- Per-variant kit identity: each id's previous build, inventoried row by row (lane evidence `inventory/<id>.md`) with
  its packet: `leo2a6.md` (today's leo2a4), `leo2a5.md` (leo2a4_v), `leo2a4m.md` and `leo2a4m_x.md` (leo2a4m_can, with
  the owner-supplied 2A4M CAN model's measurements), `leo2a6m.md` (leo2a4_otco), `leo2a7v.md` (leo2_improved).

## Construction

- Hull and running gear: `buildLeopard2Hull(P, { exhaust: 'rods', foreSkirtDropM: 0.16, fuelFillers: true })`.
- Turret (turret metres from the ring at (0, 1.64, 0.37)): the 2A6 X's walls (1.274 m right, 1.177 m left of the gun),
  roof (0.79, falling to 0.74 over the front block), floor (0.058, rising to 0.214 over the bustle); the bustle's
  chamfered rear to the rear plate at -2.64; the front block from the 2A6 X's seam (z 1.0977) to the faces at 1.65:
  level top to 1.45, bevel to the faces' top at 0.61, outer corners cut back from 1.38, the EMES 15 pocket in the right
  cheek (x -0.94..-0.50, y 0.42..0.74, the head 0.35 m behind the face); the wide mantlet (slot ±0.50) 3 cm behind the faces; the
  commander's ring with eight periscopes and the PERI R17 ahead of it, the loader's ring with its periscope and machine
  gun; the 2A6 X's two rows of four smoke tubes a side; grab rails; the ammunition hatch welded shut on the left wall; bins
  on the bustle's sides; two whips; the 2A6 X's aft lifting arch. Trunnion (0, 0.33, 1.42); L/44 4.10 m and L/55 5.34 m
  trunnion to muzzle at the hull's scale.
- Honest armour: only the vehicles' armour in the primary 'hull'/'turret' buckets; add-on armour through
  `addExternalArmor`, ERA through `P.eraCluster`; everything else equipment or detail.
- Gun stops (`GUN_PITCH_BY_YAW_DEG`, `leopard2A4FamilySpecs.ts`): measured with `tools/gun-depression-sweep.mjs` at
  26 mm (strv121 `--no-suit`); all seven clear at full elevation with no mount conflicts. Square turrets: -9 to the
  front and sides (-8.3 at yaw 21-28 over the front mudguards), the rear quarters lifted by the engine deck and its
  stowage (leo2a4/strv121 to +1.6; leo2a4_v and leo2a4m +3; the CAN's stern rack +8). The CAN's width rods ride folded
  along the fore rail (stood up they held the gun at -1.6 over the front quarters). Wedge turrets: the 2A6 X's mantlet
  cover rides the 2A4's deeper trunnion, so its underside holds the gun over the deck at yaw 47-61 (-5.5) and over the
  sponsons' stowage abeam (leo2a4m -6 to -1.5 at 113-149; leo2a4_otco -3.6 to -0.4 at 59-155; leo2_improved -5 to -1.3
  at 54-151 and +6 over the APU housings at 152-165). Owed (next release): raise the cover's underside on the deeper
  trunnion and lower the sponson stowage to give the wedge turrets -9 abeam.

## Round log

- R0 (2026-10-28): research, inventories (six files, ~250 carry-over rows), the turret derivation and registration by
  the Huber drawing; leo2a4's kit carried.
- R1 (2026-10-28, the owner): the turret front rebuilt to the photographed sloped form.
- R2 (2026-10-28, the owner): the even split, the 2A6 X's wedge front ported for the three upgrades; the five other kits
  carried (inventories: nothing dropped without a reason); the CAN's and the Improved's own skirts on a skirtless hull,
  inboard on the sponsons; the Strv 121 added; Main's fidelity ruling applied.
- R3 (2026-10-28/29): the gun stops measured (seven sweeps, 26 mm; the CAN's width rods folded); the fairness drop of the
  square fronts found (the wide 2A4 mantlet on the range's aim point; the CAN's near-vertical MEXAS cheeks) and the
  same-tier levers set (mantlet x2.45 leo2a4, x2.2 leo2a4_v; the CAN x1.28 mantlet then x1.33 turret front); the
  chevron courses side by side again (one quad doubled the spaced layer); the OTCO's Barracuda skin wound outward and its
  missed cells dropped (its gun junction closes); the Garage worker registers the family; blind critic rounds (leo2a4's
  decor rebuilt: standing whips, deck load, the fleet cargo off the turret its kit loads; the OTCO's label and tighter
  cheek ERA); the Strv 121 returned to its base build for this release.
- R4 (2026-10-29, the release gate): the lane gate's reds and their fixes.
  - B2 contiguity: the hull's stern rack sat empty on leo2a4 and leo2_improved (54 cells: the 2A4 V's stern frame floors
    it, the others' loads had moved to the deck), the CAN's tall rack left its outer bays open (30), the OTCO's rear slat
    panel stood 8 cm off the plate (26 + 144 phase-only) and its bow flares left the mudguards' corners open. Fixed with
    `sternRackFloor` (leopard2A4KitParts.ts; also the Strv 121), the CAN's bay floors, the OTCO's panel flange and flare
    plates: the Node replica reads 0 at all nine phases on the six.
  - Sealed: the 2A4 turret's smoke tubes were bare open cylinders (their inside read as an opening from a low front view):
    lined to the grenade's face 4 cm in (open px 120-170 -> 5-38). The stern rack's tubes fell on a pixel-centre column in
    the Improved's census frame: sleeved 5 mm (38 -> 6 px). leo2a4m, leo2a4m_can, leo2a4_otco and leo2_improved hold
    their rows; leo2a4 and leo2a4_v went OUT OF FRAME (the L/55 build's frame; the standing whips) and were re-recorded
    as new vehicles (Main 2026-10-29): SEALED, 14 and 4 single-pixel clusters (lane evidence sealed-rerecord/).
  - Stage A (Main 2026-10-29): the five unregistered ids qualify by per-id photo packets
    (docs/references/photos/leopard-*-20261029.json, item/photo-packets-265's format: the as-built envelope in the
    fields, the published figures in envelopeBasis) and the blind critic PASSes; the native fixture is
    `profiles/leopard2A4Family.selftest.mjs`. Their PHOTO_REFERENCE_PACKETS rows land after item/photo-packets-265.
  - leo2a4m_can stays registered (leo2a4m_arrafi.glb): dims 41.7 (height p95 2.79 against the spec's 2.62, length 9.69
    in the oracle's frame against 9.96), whole 84.9. A fresh main run with the same oracle (2026-10-29) reads main's own
    CAN at min 0: dims 0 (height 2.50, hull 7.06, overall 9.27), whole 79.2; the stored 86.1 record was stale. The spec's
    9.96 m is the DND's published 2A4M CAN length; its 2.62 m is the old build's p95 recipe line (leo2a4m.md), and the
    DND publishes 2.75 m. heightM also drives tankBodyContacts and spotting, so it stays (combat data unchanged): Main's
    call.
  - Sourcing (published figures, release 264): "Leopard 2A4 V" and the fleet's "Leopard 2A4M" are not fielded
    designations (only Canada fielded a 2A4M); the real OTCo tank is a Dutch 2A4NL with the L/44 and the Leopard 2
    Improved (KWS II TVM) trialled with the L/44, so their L/55 rode the old builds' specs.
- R5 (2026-10-29, the owner's rulings via Main): leo2a4m is labelled a concept (vehicleFacets.ts); leo2a4_otco and
  leo2_improved take the L/44 (its geometry and round figures; their gun stops re-measured); leo2a4m_can's heightM is the
  DND's 2.75 m; leo2a4_v becomes the Ukrainian-service 2A4 under Kontakt-1 on its own head (item/leo2a4v-era-265).
- R6 (2026-10-29, item/leo2a4v-era-265): leo2a4_v under Kontakt-1 from the service photographs (TWZ; armyrecognition.com
  after the Praise The Steph video, 2023-07-01; lane evidence ~/cot-lanes/leo2a4v-era-265-evidence/refs): 102 4S20
  containers (leopard2A4Kontakt1.ts, one course table for the containers and the plates; profiles/leopard2A4Kontakt1Kit.ts
  lays them as ERA fields): 6 on the left cheek's face and 3 up its bevel, 5 on the right cheek's round the EMES 15 notch,
  20 down each wall ahead of the smoke rows (clear of the welded ammunition hatch), 24 on each fore skirt block; the
  glacis and the mantlet bare as photographed; the faces' and the walls' grab rails and the wall crosses come off under
  them. COMBAT ADDITION: seven ERA plates (k1_turret_face_R/L, k1_turret_bevel_R, k1_turret_wall_R/L, k1_skirt_R/L) with the
  fleet's Kontakt-1 values (12 mm, 0.05 kinetic reduction, 280 mm against chemical energy), through the family envelope's
  addedPlates. Contiguity 0 at all phases, sealed holds (4 px), strict track clip 0/0+0/0, nationalGunClearance PASS,
  traverse as the base (the ring seat's -3 mm); blind critic PASS (notes: the camouflage runs across the containers; a
  possible dark flap under each cheek, too blurred to place). Fairness (VIII round robin, 120 m, the balance range's
  APFSDS duel): 0.751 before and after (6/29 in band): Kontakt-1's 0.05 kinetic reduction moves no pairing; its 280 mm
  against chemical energy is for the balance session's HEAT and missile scenarios.
  - The Strv 121 (item/strv121-2a4-265): its stern rack floored; its track sweep (28 voxels) is the field suit's
    `strv122_ghillie_hull_net` at x ±1.68, y 1.16-1.22, and its netting px (2,243 against main's 2,806 row) moved with
    the re-seated suit: both routed to the ghillie lane (Main).
- Strv 121, R4 (2026-10-29, item/strv121-2a4-265; Main: next release): the rebuild merged with the lane head and the ghillie lane's
  suit fix; the 262 skip window dropped from nationalGunClearance; blind critics: round 1 (skirt height: contradicted by
  the Huber drawing and the photos, the critic had no images), round 2 (the hull's splash board: the suit nets one arm and
  clears the driver's periscopes, the bare other arm read as a loose plank) -> the Strv 121 leaves the splash board off;
  round 3 PASS. Its auxiliary summary counts the 2A4's sixteen smoke tubes (the row had carried the old build's 28).
- Strv 121, R5 (2026-10-29): the stern rack floored (54 contiguity cells); its suit's skirt drapes split around the 2A4
  skirts' two open seams (the strict track clip: 28 voxels of the hull net in the sweep -> 0); the netting row
  re-baselined (2,139 px; main's row 2,806); its photo packet; a shaded side critic PASS (stills4).
- 2026-10-30 (the christian2 lane; the owner: "make the otehr 2a4s have that correct window"): the EMES 15 window
  deepened to the Christian II's 0.35 m to the sight head (it was 0.22, the head at the bevel's edge, the window
  reading flush with the face in right-front renders), its width and sill unchanged; the housing shortened 0.62 ->
  0.49 m so its rear stays at z 0.685, clear of the PERI R17's drum; the window's plate and the optics module follow
  the datums (shared cheek front, leopard2CheekFrontDatums.ts).
  The window critics (three rounds on leo2a4, leo2a3_b4, leo2a4_v, leo2a4m_can, strv121): PASS on the recess for all;
  fixed on the way: the CAN's bolted cap on the sill-level wedge piece (dropped), the Strv 121's net (opened over the
  window), the 2A4's right front eye (outboard of the lip). Kept against one critic's FAIL: the housing's lip running
  14 cm past the window's outer wall (the 2A3's photo critic asked for it from the owner's Austrian 2A4 photo; two
  other critics read it minor).
