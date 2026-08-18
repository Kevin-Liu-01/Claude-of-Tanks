import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('ztz99a2', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

const turretRig = tank.root.getObjectByName('rig_turret');
const shell = tank.root.getObjectByName('turret');
const equipment = tank.root.getObjectByName('turretEquipment');
const detail = tank.root.getObjectByName('turretDetail');
const dark = tank.root.getObjectByName('turretDark');

assert(turretRig && shell && equipment && detail && dark,
  'ZTZ-99A2: rear service complex retains turret armor, equipment, detail and dark buckets');
let equipmentOwner = equipment.parent;
while (equipmentOwner && equipmentOwner !== turretRig) equipmentOwner = equipmentOwner.parent;
assert(equipmentOwner === turretRig,
  'ZTZ-99A2: rear equipment yaws with the complete turret rig');

function countRearVertices(mesh, minZ, maxY = 0.95) {
  const positions = mesh.geometry.attributes.position;
  let count = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    if (Math.abs(x) <= 1.34 && y >= 0.08 && y <= maxY && z <= minZ) count++;
  }
  return count;
}

shell.geometry.computeBoundingBox();
equipment.geometry.computeBoundingBox();
assert(shell.geometry.boundingBox.min.z <= -1.719,
  'ZTZ-99A2: original welded rear turret wall remains present');
assert(equipment.geometry.boundingBox.min.z <= -2.34,
  'ZTZ-99A2: populated stowage stays inside the established bustle depth');
assert(countRearVertices(equipment, -1.70) >= 2500,
  'ZTZ-99A2: dense equipment occupies the marked rear wall and basket volume');
assert(countRearVertices(detail, -1.70) >= 700,
  'ZTZ-99A2: louvres, load paths, latches and straps detail the rear complex');
assert(countRearVertices(dark, -1.70) >= 700,
  'ZTZ-99A2: bezels, fasteners and tiedowns break up the rear service wall');

tank.dispose();
console.log('ztz99a2RearService.selftest: seated service wall, populated basket, and turret ownership verified');
