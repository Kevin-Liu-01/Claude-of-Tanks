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
- Turret (turret metres from the ring at (0, 1.64, 0.37); the oracle's Leopard 2 turret plan): cheek blocks with vertical
  faces at z 1.27 and chamfered outer corners back to the 1.27 m half-width walls at z 1.03, the gun slot 0.72 m wide, the
  walls to the step at z -1.62, the bustle 1.15 m half-width to its rear plate at z -2.73 (0.86 m half-width), roof 0.66 at
  the front rising to 0.83; the mantlet recessed 3 cm in the slot with a round boss on a bolted flange narrowing to the
  sleeve, the coaxial MG3's port on the gun's left; the EMES 15 housing (right front) over its tall window in the cheek's
  face, the PERI R17 and the commander's low ring with eight periscopes (right), the loader's hatch and MG3 (left), the
  ammunition hatch on the left wall, two grab rails a side, the eight dischargers a side in one block on a bracket at the
  bustle's rear corners, the radios' antenna bases, the rear basket; the L/44 with thermal sleeves and evacuator
  (trunnion (0, 0.36, 1.04), tube 4.29 m).
- The batches (Jerchel and Schnellbacher; en.wikipedia "Leopard 2"):
  - 2A2: the crosswind sensor's hole closed by a round plate, the ammunition hatch hinged and handled, the SEM 25/35's tall
    antenna bases, pressed exhaust louvres.
  - 2A3: no crosswind sensor (only the modernised first batch shows the plate), the ammunition hatch welded shut, the SEM
    80/90's short bases, round-rod exhaust grilles.
  - 2A3 OTCO: a fourth-batch 2A3 with the field modification: four bolted spaced shrouds a side standing 9 cm off the
    walls from the cheek's corner to the step, capped back to the wall; a deeper, wider rear rack; a second radio pair.
- Combat data: `leo2a3_b4` cloned from `leo2a3` (stats, gun, rounds, paint) with the 260 trims (cycle 6.4 s, turret front
  x0.9) applied beside it in fleetBalancePass; `leo2a2` and `leo2a3` keep theirs. All three carry the 2A2's basic armour
  package on the construction's drawn hull and turret (the first four batches share it).
- Stowage: curated decor manifests (packs in the basket; a tarp on the 2A2's and the OTCO's engine decks), no random load.

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
- Checks on the final build: ids-scoped chain PASS; leopard2a3B4.selftest PASS (worst gun clearance 26.3 mm at yaw -168;
  curve as measured, identical across the three sweeps); techTree, fleetBalance, camoPolicy, camoCatalogProductionIndices,
  authoredPaintCatalog, vehicleFacets, nationIndex, garageOrder, tankIdBoundaries, nationWheelSets PASS; typecheck clean.
  Capability score 0.511, as leo2a3's.
