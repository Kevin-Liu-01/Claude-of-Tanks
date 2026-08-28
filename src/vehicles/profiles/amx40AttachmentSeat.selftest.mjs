import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('amx40', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const isOwnedBy = (object, owner) => {
  for (let cursor = object; cursor; cursor = cursor.parent) {
    if (cursor === owner) return true;
  }
  return false;
};

try {
  const turret = tank.root.getObjectByName('rig_turret');
  const shell = turret?.getObjectByName('turret');
  const details = turret?.getObjectByName('turretDetail');
  const equipment = turret?.getObjectByName('turretEquipment');
  const receipt = turret?.userData.amx40AttachmentSeatReceipt;

  assert.ok(turret, 'AMX-40 rotating turret rig exists');
  assert.ok(isOwnedBy(shell, turret), 'AMX-40 armor shell remains turret-owned');
  assert.ok(isOwnedBy(details, turret), 'AMX-40 roof fittings remain turret-owned');
  assert.ok(isOwnedBy(equipment, turret), 'AMX-40 attachment sockets remain turret-owned equipment');

  assert.equal(receipt?.revision, 'flush-r1', 'AMX-40 exposes the flush attachment revision');
  assert.equal(receipt?.sidePanels.count, 6, 'three flank cassettes remain on each side');
  assert.equal(receipt?.sidePanels.sides, 2, 'flank seating is mirrored');
  assert.equal(receipt?.sidePanels.contouredAttachmentEdges, 12,
    'every cassette end follows the local shell wall and crown');
  assert.ok(receipt?.sidePanels.shellEmbedM >= 0.02,
    'flank panels bury at least 20 mm into the turret instead of floating');
  assert.equal(receipt?.sidePanels.maxSupportGapM, 0,
    'flank panels permit no authored air gap');

  assert.equal(receipt?.roof.antennaSockets, 3,
    'all three marked antenna pots have roof-to-pot sockets');
  assert.ok(receipt?.roof.supportedParts >= 10,
    'marked roof optics, receiver course, sight brow, and antenna pots are supported');
  assert.ok(receipt?.roof.minimumContactEmbedM >= 0.01,
    'roof fittings keep a positive structural overlap');
  assert.equal(receipt?.roof.maxSupportGapM, 0,
    'roof fittings permit no authored air gap');

  assert.equal(receipt?.cheekTies.count, 2, 'both forward cheek panels have shell ties');
  assert.ok(receipt?.cheekTies.shellEmbedM >= 0.02,
    'forward cheek ties penetrate the crown instead of stopping short');
  assert.equal(receipt?.cheekTies.maxSupportGapM, 0,
    'forward cheek panels permit no authored air gap');

  shell.geometry.computeBoundingBox();
  assert.ok(shell.geometry.boundingBox.max.x <= receipt.sidePanels.outerSilhouetteXM + 1e-6,
    'flush seating does not widen the AMX-40 turret silhouette');
  assert.ok(shell.geometry.boundingBox.min.x >= -receipt.sidePanels.outerSilhouetteXM - 1e-6,
    'mirrored flush seating preserves the port-side silhouette');
} finally {
  tank.dispose();
}

console.log('amx40AttachmentSeat.selftest: flank panels, roof fittings, and cheek ties are flush and turret-owned');
