# Leopard 2A3 (fourth batch) — run packet

Template: `docs/tank-generation/templates/run-packet.md`. Lane `item/leo2a3-b4-262` (release 262), built on
`item/christian2-262`.

## Current status

- Updated: 2026-10-27.
- Owner request (verbatim, 2026-10-27, to the christian2-262 lane): "the new leo annd leo changes should rightfully be
  based on the new model and use totally new tank generation. the type 90 is a separate tank". Main's scope the same day:
  keep `leo2a2` ("Leopard 2A2") and `leo2a3` byte-identical; show `leo2a3` as the "Leopard 2A2 OTCO" (display only, every
  name surface); ONE new tank `leo2a3_b4` "Leopard 2A3" (the fourth batch: SEM 80/90 radios with shorter antenna bases,
  round-rod exhaust grilles; the ammunition hatch left as built) at tier IV with the current 2A3's combat data, on the same
  new first-party Leopard construction as the Christian II; a 2A2 variant never above a 2A3.
- IDs: `leo2a3_b4` (new), `leo2a3` (display renamed only).
- Implementation status: built (profiles/leopard2a3B4.ts on profiles/leopard2Hull.ts; datums and armour in
  leopard2a3B4Armor.ts; spec leopard2a3B4Specs.ts).
- Publication: lane branch; Main integrates.

## Scope and preservation

- Mode: new first-party build of a production vehicle on the release's shared Leopard 2-pattern construction (the
  Christian II concept model's measured Leopard 2 proportions, read for proportions only).
- Owned files: `src/vehicles/profiles/leopard2a3B4.ts`, `src/vehicles/leopard2a3B4Armor.ts`,
  `src/vehicles/leopard2a3B4Specs.ts`, `src/vehicles/profiles/leopard2a3B4.selftest.mjs`, this packet; one registration line
  each in the shared tables; the display rename across tankLabels, the spec name, the camo signature label, the i18n
  catalogs (en-US, zh-CN), the fleet wall, the media captions and the roster.
- Protected originals: `leo2a2`, `leo2a3` geometry and combat data byte-identical (the fleet geometry ledger proves it);
  `leopard.ts` untouched.

## Construction

- Hull and running gear: `buildLeopard2Hull(P, { exhaust: 'rods' })`, the Christian II's construction with the fourth
  batch's round-rod exhaust grilles.
- Turret (turret metres from the ring at (0, 1.64, 0.37); the oracle's Leopard 2 turret plan): cheek blocks with vertical
  faces at z 1.27 and chamfered outer corners back to the 1.27 m half-width walls at z 1.03, the gun slot 0.72 m wide, the
  walls to the step at z -1.62, the bustle 1.15 m half-width to its rear plate at z -2.73 (0.86 m half-width), roof 0.66 at
  the front rising to 0.83; the mantlet in the slot, the coaxial MG3's port on the gun's left; the EMES 15 bay (right
  front), the PERI R17 and the commander's hatch with eight periscopes (right), the loader's hatch and MG3 (left), the
  ammunition hatch on the left wall, two banks of four dischargers a side ahead of the side bins, the SEM 80/90 antenna
  bases, the crosswind mast, the rear basket; the L/44 with thermal sleeves and evacuator (trunnion (0, 0.36, 1.04), tube
  4.29 m).
- Combat data: cloned from `leo2a3` (stats, gun, rounds, paint) with the 260 trims (cycle 6.4 s, turret front x0.9) applied
  beside it in fleetBalancePass; the 2A2's basic armour package on its own drawn hull and turret.

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
