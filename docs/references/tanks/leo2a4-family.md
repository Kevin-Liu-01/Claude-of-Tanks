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
- The Strv 121 (the owner, mid-lane) is built on `item/strv121-2a4-265` and ships next release with the ghillie lane's
  re-seated suit (Main, 2026-10-29: its nationalGunClearance read 18.84 mm from the suit's hull net at yaw 180); this
  release keeps its base build, every table row equal to the base's.
- Implementation status: built; regen chain, gun stops, gun lines, rigs, seats, spare track and ledger green on the six.
- Qualification status: blind critics (SwiftShader Gallery stills, front34/side/rear34/front): PASS on all six
  (leo2a4m, leo2a4m_can, leo2_improved, leo2a4_v round 1; leo2a4_otco round 3; leo2a4 round 4). The release gate's
  lock-free steps pass by hand (module-visual-align red as on the base's 262 family); its capture-locked scoring stage,
  the asset hold and the hero cards timed out in the 2026-10-29 capture queue and are owed.
  Fairness (VIII round robin, 120 m) before -> after: leo2a4 0.497 -> 0.468, leo2a4_v 0.724 -> 0.747, leo2a4m 0.842 ->
  0.909, leo2a4m_can 0.493 -> 0.474, leo2a4_otco 0.83 -> 0.911, leo2_improved 0.833 -> 0.915 (balanceMatchups 20/20).
- Publication: lane branch; Main integrates.

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
  byte-identical) after the 262 turret-front head merged. The strv121 ghillie suit row belongs to the ghillie session,
  re-seated on this geometry after it lands.
- Combat data: every stat, gun and round, paint and every armour plate's protection (physical, KE, CE, kind, ERA, module
  link) stands under its own name; only where the plates stand moves (the 2A6/2A5 wedge and chevron layers become the
  spaced layer inside the 2A4 front block). Gun geometry: L/44 on leo2a4, leo2a4_v, leo2a4m, leo2a4m_can; L/55 on
  leo2a4_otco and leo2_improved (leo2a4's old build drew a 2A6's L/55; its published gun-forward length becomes 9.67 m).

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
  cheek (x -0.86..-0.58, y 0.38..0.74, glass at 1.42); the wide mantlet (slot ±0.50) 3 cm behind the faces; the
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
