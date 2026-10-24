// The turret seat (turretSeatRace.ts seatTurretOverDeck) draws a seated mesh on its own copy of its geometry; the ERA
// clusters' vertex spans follow the copy (tankFactoryCore.ts onSeated). 248: on a seated T-72B3 a hit turret cassette
// stayed drawn (stripEra blanked the built geometry the turret no longer drew), and a reset wrote the built, unseated
// corners into it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTank } from './tankFactory.ts';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';

const ID = 't72b3';
assert.ok(combatAnatomyCalibration(ID)?.turretRing, `${ID}: its calibration carries the ring receipt (its turret is seated)`);
let zones = 0;
for (const quality of ['high', 'low']) {
  const t = createTank(ID, null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false, camoSeed: 4242 });
  try {
    const armor = t.root.getObjectByName('turretExternalArmor');
    assert.ok(armor?.geometry, `${ID}/${quality}: drawn turret armour`);
    const digest = () => {
      const a = armor.geometry.getAttribute('position').array;
      return createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
    };
    const built = digest();
    const owners = t.root.userData.eraClusterOwners;
    const turretZones = Object.keys(owners).filter((name) => owners[name] === 'turret');
    assert.ok(turretZones.length >= 2, `${ID}/${quality}: turret ERA clusters`);
    for (const zone of turretZones) {
      assert.equal(t.stripEra(zone), true);
      assert.notEqual(digest(), built, `${ID}/${quality}/${zone}: the strip blanks the drawn (seated) turret armour`);
      assert.equal(t.resetEra(), true);
      assert.equal(digest(), built, `${ID}/${quality}/${zone}: a reset restores the seated corners exactly`);
      zones++;
    }
  } finally {
    t.dispose();
  }
}
console.log(`turretSeatEraSpans: ${ID} ${zones} turret ERA zones strip and reset on the seated turret's drawn armour`);
