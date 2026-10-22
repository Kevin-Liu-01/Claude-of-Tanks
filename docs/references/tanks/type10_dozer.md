# Type 10 (Dozer) — packet

First-party JGSDF Type 10 with the dozer kit (`type10_dozer`, profiles/japan.ts `buildType10Dozer`, kit in
profiles/type10Dozer.ts). Production base: modern3.ts `buildType10Native2026` through `buildType10DozerBase`.

## Current status

- Updated: 2026-10-21.
- Owner request (verbatim, 2026-10-21): "2. make a new type 10 variannt based off the version with a dozer!" with a
  reference render: a Type 10 in green digital camouflage, plate 99-0239, a bow-mounted dozer blade.
- ID and display name: `type10_dozer`, "Type 10 (Dozer)" (short "Type 10 Dozer").
- Implementation status: built; stowed (battle, Garage) and lowered (presentation) poses.
- Qualification status: NOT RUN (owner ruling 2026-10-21: no receipts, suites, censuses or critics; typecheck and build
  only, plus the owner screenshots).
- Publication status: lane branch `item/vehicles-type10-dozer-233`; integration by "Claude of Tanks Main".
- Never re-keyed: `type10_tk_x`, `type10b` and `type10` keep their ids and their builds (the new builder options default
  to the old plates and numbers, so their geometry and decals are unchanged).

## The real configuration

- The JGSDF calls these vehicles ドーザ装置付き (dozer-equipped). Some units' tanks carry the kit; it shows up in parade
  columns among standard hulls. Prototype No. 3 carried one (displayed at the Fuji School), and production-type dozer
  kits are modelled (Fujimi 1/72 ML15, "10式戦車 量産型 ドーザー付き").
- The blade is hydraulic, worked from inside the vehicle, and moves only up and down: it cannot angle or tilt. It is
  sized not to foul the main gun or the tank's mobility, so it digs a hasty tank scrape or clears obstacles, far short
  of a bulldozer (trafficnews.jp, "戦車ってブルドーザーになる？“ドーザー付き”車体の役割").
- Not found: published blade dimensions. The blade here is sized from the hull: 3.29 m wide (the track bands end at
  1.592 m off the centreline), 0.84 m tall along its face.

## Construction

- Hinge: two clevises welded on the lower bow plate at x ±0.62 (inside the 1.076 m track bands), pin at hull y 0.518,
  z 3.322 (6.5 cm off the plate at plate height 0.56).
- Push arms: 0.10 × 0.12 m box beams from the hinge pins to pins behind the blade's bottom rail.
- Moldboard: concave face (w = -0.10 (1 - ((u - 0.40)/0.42)^2)), 32 mm plate with three back rails extruded in one
  section, bolted cutting edge and end bits, 30 mm end plates, ribs at x ±1.15, paired arm and ram bracket plates.
- Rams: x ±0.40, from raised clevis pedestals on the beak plate (pin 0.15 m off the plate at z 3.40) to eyes behind the
  top rail; 0.42 m barrels, stroke 0.34 m between the poses; two hoses per ram from bulkhead fittings outboard of each
  pedestal (hydraulics inside the hull).
- Stowed: cutting edge at y 0.45, z 4.30, the blade tipped back 16 degrees, its top at y 1.26; the lowest kit vertex
  y 0.417, over the 0.374 belly line (coordinator ruling 2026-10-16: nothing below the belly line).
- Lowered (presentation only, `spec.visual.dozerBlade = 'lowered'` before the build): the rigid assembly turns 25.2
  degrees about the hinge; the edge sits 4 cm off the ground at z 4.18.
- Markings: no plate on the blade. Marking seats are armour-only (vehicleMarkingSeating.ts) and the kit is equipment,
  so the nose plate (behind the blade, `bowNumberPlate: false`) is dropped and the stern plate and the turret carry
  the numbers (the paint system prints the spec's tactical number, '24').
- Gameplay: the Type 10's gun, fire control and armour; 50 t, 66 km/h, 30 km/h reverse, 44 deg/s pivot, 2650 HP;
  breakthrough role (assault doctrine). The kit is equipment (`hullEquipment`), not armour.
- Paint: the owner's green digital, its own catalog paint `paint_type10_dozer` ("JGSDF Digital Woodland" /
  "陆上自卫队林地数码迷彩"), appended after GT so production's serialized camo indices hold, and the tank's stock coat
  (camoPolicy.ts DEFAULT_CAMO_PATTERN_BY_TANK_ID; otherwise it would wear Japan's national service_type10).

## Measurements (lane probes, .qa-dev/type10-dozer, not receipts)

| Check | Result |
| --- | --- |
| Kit against the base hull, stowed | Only the intended 4 mm embeds of the clevis pads, cheeks and hose fittings are within 6 mm. |
| Kit against the base hull, lowered | The same, plus 5.4 mm to the base build's nose-plate decal, which this tank does not carry. |
| Gun at its 10-degree stop over the hull, every 2 degrees of yaw | Identical to `type10_tk_x` at every yaw. The production Type 10's own mantlet underside reaches its deck at yaw 8-48 degrees each side (inherited, not the kit). |
| Gun at its 10-degree stop, kit share | The kit is never the gun's nearest surface where the base reads under 6.5 cm (identical per-yaw minima). By section: >= 0.14 m over the ram pedestals (top y 1.52 at z 3.46), >= 0.17 m over the blade top (y 1.26) at its corners; no depression change needed for the kit. |
| Inherited (not the kit) | The production Type 10 (type10_tk_x, type10b, this tank) touches its own deck with the mantlet underside at the 10-degree stop over yaw 8-48 degrees each side: a family gunPitchByYawDeg curve or mantlet fix is a separate item. |
| Blind critic (Main's light-check rule, 2026-10-21) | One critic, five randomised base/dozer pairs, key opened after scoring: base 6.5-7, dozer 5-6. Fixed in the one round: push arms 0.16 m deep (the blade read as unmounted), ram hoses from bulkhead nut and nipple to elbow ports (they read as ending in air). Not kit defects: blade paint differs between the two poses (camo is projected at build, and only the stowed pose runs in game); the muzzle bore, the stern strip and skirt tiling are the base's. |
| Lowered-pose renders | The generated interior fills are measured on the stowed build; the ~190 small boxes that plug the kit's water-holding pockets (rail troughs, ram/beak gaps) would hang in the air with the blade down, so the lowered presentation renders leave out exactly the kit-region boxes absent from the base's record. |
