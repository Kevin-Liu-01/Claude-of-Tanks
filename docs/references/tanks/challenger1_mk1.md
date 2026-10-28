# Challenger 1 Mk 1 (`challenger1_mk1`) — release 262, the sleek-turret mark

## Current status

- Added 2026-10-27 (lane item/vickers-cr1-262). Owner, after seeing the Mk 2 / Mk 3 historical rebuild (the Mk 3 rebuild is now the Granby variant): "i like the new cr
  ur building but i want a version like the onne i told u to modify with a very sleek turret and good looking hull. so we
  can have annother mk".
- What it is: the rebuilt historical hull and running gear ([challenger1_mk2.md](challenger1_mk2.md); the hull the owner
  liked) under a new sleek turret (`src/vehicles/profiles/challenger1SleekTurret.ts`) drawn in the earlier Challenger 1
  build's design language ([challenger1.md](challenger1.md)): the asymmetric crown (commander's plateau high on the right,
  loader's roof lower on the left, a rolled ramp between), cheeks swept hard back from a pointed gun nose, long low
  raked-nose bins, a stepped bustle with its rack. One cast loft: walls leaning in 15 degrees under 10 cm rolled shoulders,
  2.40 m over the foot (the earlier build's casting was 3.70 m after its 1.12 x 0.84 squash), the crown 2.36–2.40 m
  with the commander's plinth a 4 cm step, 4.36 m long with the raked bustle, 0.79 m of armour over the ring.
- It shares the gun nose, slot, drum shield, canvas boot and L11A5 with the Mk 2 and the Granby variant (`addChallenger1GunNose`,
  `addChallenger1Gun`), so the gun-port receipt and the gun rig hold the same way.
- Name: the Mk 1 is the one real Challenger 1 mark the fleet did not carry (109 built 1983–85, TOGS barbettes mostly
  empty until retrofit; en Wikipedia "Challenger 1", Haynes 2015 p. 110). The sleek turret is a game design on that
  mark, not a historical claim; flagged to Main as an owner-visible naming decision.
- Combat row: the Mk 2's (`additionalFleetSpecs.ts` `challenger1Row`), tier VIII, the Challenger line's lane 0 off the
  Chieftain Mk 5.
