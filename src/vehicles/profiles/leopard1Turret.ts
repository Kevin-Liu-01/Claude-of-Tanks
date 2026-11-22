// The Leopard 1 turret family (release 275; owner 2026-11-21: "make all leopard 1a... tanks' turrets be same height and
// properly shaped based on those turrets because all the other countries leopard 1a... variants have weirdly tall
// turrets"). Every Leopard 1 in the fleet seats its turret on one ring and stands its roof at one height, whichever
// turret it carries: the cast turret of the A1/A2 (and the 1A2A1's one-piece casting of the 1A5's lines), the 1A5's
// casting with the Blohm & Voss wedges, or the welded spaced turret of the A3/A4 that the Danish 1A3 DK / 1A5 DK and the
// Australian AS1 carry. The national kit (sights, cupolas, dischargers, stowage, MGs) is a layer on top and never moves
// the ring or the roof.
//
// Sources: Wikipedia (en), Leopard 1: 2.39 m to the turret roof, 2.7 m overall. Panzermuseum Munster data placards: the
// Leopard 1 A4 (the welded "Turm in Schottbauweise") 2.62 m high and the Leopard 1 A5 2.71 m, both over the commander's
// sights, so the welded turret stands no taller than the casting. A side photograph of a Leopard AS1 (Veterans Memorial
// Park, Port Kennedy, Commons, CC BY-SA 4.0) measured by its road-wheel pitch: the welded roof 0.79 m over the turret's
// base (the Danish packet's Krigsmuseet read of 0.87 m was over by 8 cm). docs/references/tanks/leo1a5.md and
// leopard_as1.md carry the gap tables.

/** Turret-local datums shared by every Leopard 1 build: the ring 0.50 m ahead of the hull's origin, on the 1.58 m deck
 * plus a 0.02 m race, and the flat roof 0.79 m over it at the published 2.39 m. */
export const LEO1_TURRET = Object.freeze({
  ringZ: 0.50,
  ringY: 1.60,
  roofOverRingM: 0.79,
  roofY: 2.39,
});

/** Every Leopard 1 in the fleet and the family turret it carries (leopard1Turret.selftest.mjs builds each one
 * and holds its ring and roof to LEO1_TURRET, and fails on a Leopard 1 missing here). */
export const LEO1_TURRET_FAMILY: Readonly<Record<string, 'cast-bv' | 'cast-one-piece' | 'welded'>> = Object.freeze({
  leo1a5: 'cast-bv',
  leo1a2a1: 'cast-one-piece',
  leo1a3dk: 'welded',
  leo1a5dk: 'welded',
  leo1a5dk1: 'welded',
  leopard_as1: 'welded',
});
