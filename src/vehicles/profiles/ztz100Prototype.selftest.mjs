import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { TANK_SPECS } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { internalLayoutFor } from '../internalLayoutRegistry.ts';
import { SURFACE_MARKING_STYLE, vehicleMarkingAnchor } from '../vehicleMarkings.ts';
import { ZTZ100_PROTOTYPE_PROFILES, ZTZ100_PROTOTYPE_DATUMS } from './ztz100Prototype.ts';

// Owner-requested restoration, not fidelity to the later OD source rebuild.
// Authentication target: 31d08f673:src/vehicles/profiles/ztz100X.ts, original
// blob f8c82e6965bac41b4df8cb5b33b6a1480032ae3a (introduced in 2b869b9d0).
const source = readFileSync(new URL('./ztz100Prototype.ts', import.meta.url), 'utf8');
const historical = source.slice(source.indexOf('// ZTZ-100 (`ztz100_x`'))
  .replaceAll('ZTZ100_PROTOTYPE_DATUMS', 'ZTZ100_X_DATUMS')
  .replaceAll('ZTZ100_PROTOTYPE_PROFILES', 'ZTZ100_X_PROFILES')
  .replaceAll('buildZtz100Prototype', 'buildZtz100X')
  .replace('  ztz100_prototype: Object.freeze', '  ztz100_x: Object.freeze');
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(historical), '19f8c7cfefc24bd32bed31b84988b5252fbda5e25c21e1c7f8d41b471d77e4b8',
  'restored authored recipe equals historical file after only public API/key renames');
assert.notEqual(digest(readFileSync(new URL('./ztz100X.ts', import.meta.url))), digest(historical),
  'the current service model is not the historical restoration target');
const id = 'ztz100_prototype';
const spec = TANK_SPECS[id];
assert.ok(spec, 'actual new prototype is registered');
assert.equal(spec.name, 'ZTZ-100 Prototype');
assert.equal(tankTier(id), 9);
assert.deepEqual(spec.dims, { hullLengthM: 6.94, overallLengthM: 8.98, widthM: 3.70, heightM: 2.31, silhouetteHeightM: 3.04 });
assert.deepEqual(spec.armor.turretPivot, [0, 1.41, -.55]);
assert.deepEqual(spec.armor.gunPivot, [0, .35, 1.10]);
assert.equal(spec.gun.caliberMm, 105);
assert.equal(ZTZ100_PROTOTYPE_DATUMS.wheelStations.length, 7);
const layout = internalLayoutFor(id);
assert.ok(layout && ['documented', 'platform-inferred', 'published-demonstrator', 'owner-directed'].includes(layout.confidence),
  'prototype has a supported explicit internal-layout confidence');
assert.ok(layout.sources.length || layout.confidence === 'owner-directed', 'layout has an evidence trail');
assert.ok(spec.armor.modules.some(module => module.module === 'optics'), 'core optics gameplay volume exists');
assert.ok(vehicleMarkingAnchor(id), 'new exact ID has an explicit marking anchor');

const additions = [];
registerProfiledBuilders({ [id]: p => ZTZ100_PROTOTYPE_PROFILES[id].build(new Proxy(p, {
  get(target, key) {
    const value = target[key];
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addGunExtra', 'addGunExtraDark', 'addModuleVisual'].includes(key)) {
      return (...args) => {
        const geometry = args.find(arg => arg?.isBufferGeometry);
        if (geometry?.userData.ztz100) additions.push(geometry.userData.ztz100);
        return value.apply(target, args);
      };
    }
    return typeof value === 'function' ? value.bind(target) : value;
  },
})) });

function assertHistoricalStock(parts) {
  const count = name => parts.filter(part => part === name).length;
  for (const [name, expected] of Object.entries({ 'hull-body': 1, 'turret-body': 1,
    'skirt-upper': 18, 'skirt-lower': 12, 'skirt-lip': 10, 'cage-bin': 1,
    'deck-rack-floor': 1, 'panoramic-drum': 1, 'roof-hatch': 2, 'brake-baffle': 6,
    'met-mast': 1, 'antenna-stub': 2, 'rws-fork': 2, 'rws-tube': 2,
    'tower-drum': 2, 'missile-bank': 1 })) assert.equal(count(name), expected, name);
}
function assertMarking(mark, tank) {
  assert.equal(mark.userData.surfaceSupported, true);
  assert.equal(mark.userData.visibilityVerified, true);
  assert.equal(mark.userData.visibilitySamples, SURFACE_MARKING_STYLE.visibilitySampleCount);
  assert.ok(mark.userData.visibilityClearSamples >= SURFACE_MARKING_STYLE.minimumClearSamples);
  assert.ok(mark.scale.x >= SURFACE_MARKING_STYLE.minimumReadableSizeM);
  assert.equal(mark.userData.supportGapM, SURFACE_MARKING_STYLE.surfaceLiftM);
  const owner = tank.root.getObjectByName(`rig_${mark.userData.surfaceOwner}`);
  assert.ok(owner, 'paint has the claimed rig owner');
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mark.getWorldQuaternion(new THREE.Quaternion()));
  const origin = mark.getWorldPosition(new THREE.Vector3()).addScaledVector(normal, .018);
  const candidates = [];
  owner.traverseVisible(mesh => {
    if (mesh.isMesh && ['hull', 'hullTrackGuardL', 'hullTrackGuardR', 'turret', 'turretPermanentMarkingSurface'].includes(mesh.name)) candidates.push(mesh);
  });
  assert.ok(new THREE.Raycaster(origin, normal.negate(), 0, .05).intersectObjects(candidates, false).length,
    'finite first-party armor lies behind each solved marking');
}
const results = [];
try {
  for (const quality of ['high', 'low']) {
    additions.length = 0;
    // Inspect each solved mark before LOW's shared-material static batch merges
    // their semantic tags. Production batching and all physical assertions stay intact.
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false, deferStaticBatch: true, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      assertHistoricalStock(additions);
      assert.throws(() => assertHistoricalStock(additions.filter(part => part !== 'cage-bin')), /cage-bin/,
        'replacing historical filled bin with the modern open cage is not a restoration');
      assert.throws(() => assertHistoricalStock([...additions, 'brake-baffle']), /brake-baffle/,
        'changed brake topology cannot silently become the historical target');
      assert.ok(tank.root.getObjectByName('ztz100RemoteMachineGun'), 'historical fitting remains real equipment');
      const parts = tank.root.userData.combatGeometryParts;
      assert.ok(parts?.some(part => part.module === 'optics' && part.parent === 'turretG'), 'actual turret sight stock tags optics');
      assert.ok(parts?.some(part => part.module === 'optics' && part.parent === 'hullG'), 'actual hull periscopes/lenses tag optics');
      const marks = [];
      tank.root.traverse(mesh => {
        if (mesh.geometry) for (const attribute of Object.values(mesh.geometry.attributes))
          assert.ok(Array.from(attribute.array).every(Number.isFinite), `${mesh.name}: finite emitted geometry`);
        if (mesh.userData.vehicleMarking && ['insignia', 'designation'].includes(mesh.userData.markingKind)) marks.push(mesh);
      });
      assert.equal(tank.root.userData.markingSeatPath, 'surface-solver', 'pre-generation proof runs actual seat solver');
      assert.ok(marks.some(mark => mark.userData.markingKind === 'insignia'));
      assert.ok(marks.some(mark => mark.userData.markingKind === 'designation'));
      marks.forEach(mark => assertMarking(mark, tank));
      const positions = marks.map(mark => mark.getWorldPosition(new THREE.Vector3()));
      tank.root.getObjectByName('rig_turret').rotation.y = Math.PI / 2;
      tank.root.updateMatrixWorld(true);
      marks.forEach((mark, index) => {
        const distance = mark.getWorldPosition(new THREE.Vector3()).distanceTo(positions[index]);
        assert.ok(mark.userData.surfaceOwner === 'hull' ? distance < 1e-7 : distance > .02, 'marking follows its actual owner');
      });
      results.push({quality, historicalStock: true, optics: true, confidence: layout.confidence,
        markings: marks.map(mark => ({kind: mark.userData.markingKind, parent: mark.userData.surfaceOwner,
          position: mark.position.toArray(), clearSamples: mark.userData.visibilityClearSamples}))});
    } finally { tank.dispose(); }
  }
} finally { registerProfiledBuilders({ [id]: ZTZ100_PROTOTYPE_PROFILES[id].build }); }
console.log('ztz100Prototype: historical recipe, actual HIGH/LOW stock, optics, layout and marking seats PASS', JSON.stringify(results));
