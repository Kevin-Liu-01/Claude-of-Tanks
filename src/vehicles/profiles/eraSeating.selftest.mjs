import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const n = new THREE.Vector3();

function triangles(mesh, accept) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const found = [];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    n.fromBufferAttribute(normal, i).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const face = { centroid, normal: n.clone(), area };
    if (accept(face)) found.push(face);
  }
  return found;
}

// The removed chevron bars were single 0.8 m-wide panels. Their broad face
// triangles exceeded 0.10 m² inside this front-cheek envelope. Real T-80/B
// applique returns and the BV's individual Kontakt cassettes remain smaller.
for (const id of ['t80', 't80b', 't80bv']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const track = tank.root.getObjectByName('turretTrack');
  const continuousBars = track?.geometry ? triangles(track, ({ centroid, area }) =>
    area > 0.10 && Math.abs(centroid.x) > 0.45 && Math.abs(centroid.x) < 1.4
      && centroid.y > 0.15 && centroid.y < 0.75 && centroid.z > 0.70) : [];
  assert.equal(continuousBars.length, 0,
    `${id} has no redundant continuous turret ERA bar`);
  assert.ok(track === undefined,
    `${id} cheek protection inherits turret camouflage instead of generic gray track steel`);
  tank.dispose();
}

// Release 262: the T-84U Oplot is the Oplot-M/T family's 2000 stage (profiles/oplotBM.ts variant 'u'): its Kontakt-5
// boxes on the glacis, the turret front and the forward skirt panels wear the vehicle's paint, every gameplay ERA plate
// of its spec has exactly one visual cluster, and the fleet's layered ERA finish holds.
const oplot = createTank('t84bm_oplot_m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
assert.ok(oplot.root.getObjectByName('turretTrack') === undefined,
  'T-84U Kontakt-5 turret boxes inherit the turret camouflage palette');
assert.ok(oplot.root.getObjectByName('hullTrack') === undefined,
  'T-84U Kontakt-5 glacis and skirt boxes inherit the hull camouflage palette');
const oplotEraPlates = [...new Set(
  [...TANK_SPECS.t84bm_oplot_m.armor.hullPlates, ...TANK_SPECS.t84bm_oplot_m.armor.turretPlates]
    .filter((plate) => plate.kind === 'era')
    .map((plate) => plate.name),
)].sort();
assert.deepEqual(oplot.root.userData.eraClusterNames, oplotEraPlates,
  'every T-84U gameplay ERA plate has one exact visual cluster');
const finish = oplot.root.userData.eraFinishReceipt;
assert.ok(finish, 'the T-84U publishes the fleet layered ERA finish receipt');
assert.equal(finish.revision, 'fleet-layered-vehicle-scale-camo-r1');
assert.equal(finish.camoProjection, 'vehicle-scale-box-uv');
assert.equal(finish.bodyAndCoverUseVehiclePaint, true,
  'T-84U cassette bodies and top layers both inherit the vehicle camouflage');
assert.deepEqual(finish.owners, ['hull', 'turret']);
assert.equal(finish.maximumDrawBuckets, 2,
  'all T-84U ERA remains in one static merged bucket per articulation owner');
assert.equal(finish.perFrameWork, false);
assert.ok(oplot.root.getObjectByName('turretExternalArmor')?.geometry,
  'T-84U turret Kontakt-5 bodies and covers share the external-armor mesh');
assert.ok(oplot.root.getObjectByName('hullExternalArmor')?.geometry,
  'T-84U glacis and skirt Kontakt-5 share the external-armor mesh');

oplot.dispose();

// Runtime depletion is physical visual state: every authoritative ERA plate
// maps to exact authored vertices, collapses independently after activation,
// and returns only when a new round resets the rig.
{
  const t90am = createTank('t90am', null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const countCollapsed = () => {
    let collapsed = 0;
    t90am.root.traverse((node) => {
      const position = node.geometry?.getAttribute?.('position');
      if (!position) return;
      for (let index = 0; index < position.count; index++) {
        if (position.getY(index) < -900) collapsed++;
      }
    });
    return collapsed;
  };
  const plateNames = [...new Set(
    [...TANK_SPECS.t90am.armor.hullPlates, ...TANK_SPECS.t90am.armor.turretPlates]
      .filter((plate) => plate.kind === 'era')
      .map((plate) => plate.name),
  )].sort();
  assert.deepEqual(t90am.root.userData.eraClusterNames, plateNames,
    'every T-90M gameplay ERA plate has one exact visual cluster');
  const before = countCollapsed();
  let previous = before;
  for (const plateName of plateNames) {
    assert.equal(t90am.stripEra(plateName), true,
      `${plateName} resolves an authored visual cassette cluster`);
    const next = countCollapsed();
    assert.ok(next > previous, `${plateName} removes visible authored vertices`);
    assert.equal(t90am.stripEra(plateName), true, `${plateName} depletion is idempotent`);
    assert.equal(countCollapsed(), next, `${plateName} is not depleted twice`);
    previous = next;
  }
  assert.equal(t90am.resetEra(), true, 'new round restores authored ERA placement');
  assert.equal(countCollapsed(), before, 'restored ERA has no collapsed cassette instances');
  t90am.dispose();
}

console.log('eraSeating.selftest: ERA caps are seated, consumable, and resettable');
