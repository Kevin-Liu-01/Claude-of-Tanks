import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';

// These existing dark Barak apertures retain their visible material. Their
// damage receipts must follow the same turret frame as the real sight stock.
const barakStations = [
  ...[[-.0334,-1.1518,Math.PI/2],[-.1558,-.8617,Math.PI/4],
    [-.4363,-.7324,0],[-.7176,-.8552,-Math.PI/4],[-.8442,-1.1421,-Math.PI/2]]
    .map(([x,z,a]) => [x+Math.sin(a)*.051,2.687,z+Math.cos(a)*.051]),
  [.5577,2.721,-.703],[-.6673,2.612,.101],
].map(([x,y,z]) => [x,y-1.605,z+.3906]);
const expected = { merkava4_barak: 7, merkava4_trophy: 2, namer_ifv: 3 };
function verify(id, parts) {
  const optics = parts.filter(p => p.module === 'optics');
  assert.equal(optics.length, expected[id], `${id}: actual sight-part count`);
  assert.ok(optics.every(p => p.parent === 'turretG'), `${id}: sight owner`);
  assert.ok(getSpec(id).armor.modules.find(m => m.module === 'optics')?.turretLocal,
    `${id}: visible sights agree with the canonical damage owner`);
  for (const p of optics) for (let axis = 0; axis < 3; axis++) {
    assert.ok(Number.isFinite(p.min[axis]) && p.max[axis] > p.min[axis], 'finite sight stock');
  }
  if (id !== 'merkava4_barak') return;
  assert.ok(optics.every(p => p.bucket === 'turretDark'), 'retain actual dark aperture bucket');
  for (const center of barakStations) {
    assert.equal(optics.filter(p => center.every((v,axis) =>
      Math.abs((p.min[axis]+p.max[axis])/2-v) < 1e-6)).length, 1,
    'exactly one receipt at each existing visible Barak sight station');
  }
}
await ensureInteriorFills(Object.keys(expected));
for (const quality of ['high','low']) for (const id of Object.keys(expected)) {
  const tank = createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try {
    const parts = tank.root.userData.combatGeometryParts;
    verify(id,parts);
    if (id === 'merkava4_barak') {
      const index = parts.findIndex(p => p.module === 'optics');
      const missing = structuredClone(parts); missing[index].module = null;
      assert.throws(() => verify(id,missing), /sight-part count/, 'lost optical tag fails');
      const wrongOwner = structuredClone(parts); wrongOwner[index].parent = 'hullG';
      assert.throws(() => verify(id,wrongOwner), /sight owner/, 'hull-owned sight fails');
      const displaced = structuredClone(parts); displaced[index].min[0] += .03; displaced[index].max[0] += .03;
      assert.throws(() => verify(id,displaced), /visible Barak sight station/, 'wrong receipt station fails');
    }
    console.log(`${id} ${quality}: ${expected[id]} actual turret-owned sight parts PASS`);
  } finally { tank.dispose(); }
}
