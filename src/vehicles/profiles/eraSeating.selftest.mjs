import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';
import './leopard2A7VGunEra.selftest.mjs';

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
  assert.equal(track, undefined,
    `${id} cheek protection inherits turret camouflage instead of generic gray track steel`);
  tank.dispose();
}

const oplot = createTank('ua_t84_oplot_m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
assert.equal(oplot.root.getObjectByName('turretTrack'), undefined,
  'Oplot Duplet modules inherit the turret camouflage palette');
assert.equal(oplot.root.getObjectByName('hullTrack'), undefined,
  'Oplot Nozh modules inherit the hull camouflage palette');
const eraReceipt = oplot.root.getObjectByName('rig_turret')?.userData.uaOplotMERAReceipt;
assert.ok(eraReceipt, 'Oplot-M exposes a carrier-contact ERA receipt');
assert.equal(eraReceipt.carrierDerivedTransforms, true,
  'all revised Oplot-M ERA transforms come from carrier faces');
assert.equal(eraReceipt.hullGlacisCassettes, 16,
  'both four-wide glacis courses remain complete');
assert.equal(eraReceipt.turretWingCassettes, 30,
  'both turret wings carry dense three-by-five Duplet fields');
assert.equal(eraReceipt.turretShoulderCassettes, 8,
  'both turret shoulders carry four face-following wrap cassettes');
assert.equal(eraReceipt.additionalTurretCassettes, 8,
  'the revised turret gains eight cassettes over the replaced layout');
assert.ok(eraReceipt.contactEmbedM >= 0.01,
  'every revised cassette penetrates its armor carrier by at least 10 mm');
assert.equal(eraReceipt.lidNormalOffsetM, 0.003,
  'Oplot ERA lid overlays stand 3 mm proud of their cassette faces');
assert.equal(eraReceipt.maxSupportGapM, 0,
  'carrier-derived seating permits no daylight under the cassette backs');
assert.equal(eraReceipt.faceNormalAlignmentDeg, 0,
  'cassette backs and armor faces share the same normal');

const finish = oplot.root.userData.eraFinishReceipt;
assert.ok(finish, 'Oplot publishes the fleet layered ERA finish receipt');
assert.equal(finish.revision, 'fleet-layered-vehicle-scale-camo-r1');
assert.equal(finish.camoProjection, 'vehicle-scale-box-uv');
assert.equal(finish.bodyAndCoverUseVehiclePaint, true,
  'Oplot cassette bodies and top layers both inherit the vehicle camouflage');
assert.equal(finish.authoredParts, 112,
  'Oplot keeps 56 bodies and 56 shallow top layers in the semantic ERA buckets');
assert.deepEqual(finish.owners, ['hull', 'turret']);
assert.equal(finish.maximumDrawBuckets, 2,
  'all Oplot ERA remains in one static merged bucket per articulation owner');
assert.equal(finish.perFrameWork, false);
assert.ok(oplot.root.getObjectByName('turretExternalArmor')?.geometry,
  'Oplot turret Duplet bodies and covers share the external-armor mesh');
assert.ok(oplot.root.getObjectByName('hullExternalArmor')?.geometry,
  'Oplot glacis Nozh bodies and covers share the external-armor mesh');

oplot.dispose();

// Runtime depletion is physical visual state: every authoritative ERA plate
// maps to exact authored vertices, collapses independently after activation,
// and returns only when a new round resets the rig.
{
  const t90m = createTank('t90m', null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const countCollapsed = () => {
    let collapsed = 0;
    t90m.root.traverse((node) => {
      const position = node.geometry?.getAttribute?.('position');
      if (!position) return;
      for (let index = 0; index < position.count; index++) {
        if (position.getY(index) < -900) collapsed++;
      }
    });
    return collapsed;
  };
  const plateNames = [...new Set(
    [...TANK_SPECS.t90m.armor.hullPlates, ...TANK_SPECS.t90m.armor.turretPlates]
      .filter((plate) => plate.kind === 'era')
      .map((plate) => plate.name),
  )].sort();
  assert.deepEqual(t90m.root.userData.eraClusterNames, plateNames,
    'every T-90M gameplay ERA plate has one exact visual cluster');
  const before = countCollapsed();
  let previous = before;
  for (const plateName of plateNames) {
    assert.equal(t90m.stripEra(plateName), true,
      `${plateName} resolves an authored visual cassette cluster`);
    const next = countCollapsed();
    assert.ok(next > previous, `${plateName} removes visible authored vertices`);
    assert.equal(t90m.stripEra(plateName), true, `${plateName} depletion is idempotent`);
    assert.equal(countCollapsed(), next, `${plateName} is not depleted twice`);
    previous = next;
  }
  assert.equal(t90m.resetEra(), true, 'new round restores authored ERA placement');
  assert.equal(countCollapsed(), before, 'restored ERA has no collapsed cassette instances');
  t90m.dispose();
}

console.log('eraSeating.selftest: ERA caps are seated, consumable, and resettable');
