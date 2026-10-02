import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTank } from '../tankFactory.ts';

const materialsSource = readFileSync(new URL('../materials.ts', import.meta.url), 'utf8');
assert.match(materialsSource,
  /spec\.id === 't72b3m'[\s\S]*paintableRecs\.push\(\{ m: canvasCloth, kind: 'canvas' \}\)/,
  'T-72B3M canvas participates in live scheme tinting without sharing the camo map');

// 2026-10-01: the owner's renewal rebuilt both vehicles on detailed source studies (4c34b3e8b, cdbfe54dc):
// t72b3m is the obr. 2022 on the t72b3m_x hull with the T-90SM X turret, bmpt_terminator2 the T-80U X hull with a
// reshaped turret. The retired legacy builder's t72b3mMaterialReceipt, painted deck panels (hullWood) and Relikt
// turretTrack bucket left with it. The hierarchy itself is still the law, checked on the actual meshes: world-scaled
// camouflage on armor, fittings and ERA (one material, one box projection), never on canvas or dedicated stock.
const assertMaterialHierarchy = (id) => {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    const armor = hull.getObjectByName('hull');
    assert.ok(armor?.material?.map, `${id}: structural armor retains world-scaled camouflage`);
    assert.equal(armor.material.userData.camoProjection, 'vehicle-scale-box-uv',
      `${id}: structural armor carries the vehicle-scale box projection`);
    for (const [owner, name] of [[hull, 'hullDetail'], [turret, 'turretDetail'], [turret, 'turret']]) {
      const object = owner.getObjectByName(name);
      assert.ok(object, `${id}: ${name} mesh exists`);
      // Fleet paint standard (2026-09-11): welded fittings share the armor's world-scaled camouflage through the
      // same box projection, never a primitive-local repeat of the atlas.
      assert.strictEqual(object.material, armor.material, `${id}: ${name} shares the structural armor camouflage material`);
      assert.ok(object.geometry.getAttribute('uv') && object.geometry.getAttribute('color'),
        `${id}: ${name} carries projected UVs and baked dirt like the plates it is welded to`);
    }
    for (const name of ['hullExternalArmor', 'turretExternalArmor']) {
      const era = tank.root.getObjectByName(name);
      if (era) assert.strictEqual(era.material, armor.material, `${id}: ${name} uses continuous vehicle-scale camouflage`);
    }
    assert.ok(tank.root.getObjectByName('hullExternalArmor'), `${id}: hull ERA is present`);
    let dedicated = 0;
    for (const name of ['hullCloth', 'turretCloth', 'hullWood', 'turretTrack']) {
      const object = tank.root.getObjectByName(name);
      if (!object) continue;
      dedicated++;
      assert.equal(object.material.map, null,
        `${id}: ${name} never repeats the full camouflage atlas on primitive-local UVs`);
      assert.notStrictEqual(object.material, armor.material, `${id}: ${name} keeps its own finish`);
    }
    assert.ok(dedicated > 0, `${id}: carries at least one dedicated canvas or turntable finish`);
  } finally {
    tank.dispose();
  }
};

assertMaterialHierarchy('t72b3m');
assertMaterialHierarchy('bmpt_terminator2');

console.log('t72CamoCoverage.selftest: T-72B3M/BMPT material hierarchy keeps camo off local-UV fittings');
