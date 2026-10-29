// The hull's rubber (262; Main's ruling 2026-10-28: the rear rubber skirts take their own material role): on a rendered
// build every static rubber draw off the running gear (skirts, flaps, mudguards, mats) wears its own clone of the tyre
// rubber, role hullRubber (tankFactoryCore separateHullRubber), so the scoped armour paint colours it by where it sits,
// its grain flat under the colour (materials.ts armorPaintMode 4), and leaves the tyres bare (0). The clone is the tyres'
// rubber in every other way: the same finish, maps, defines and program, so it draws and compiles as it did. A geometry
// receipt keeps the one rubber.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { applyBurnHook, makeBurnUniforms } = await import('./materials.ts');

const gearOf = (object) => {
  for (let owner = object; owner; owner = owner.parent) if (owner.userData?.runningGear || /^gear/.test(owner.name || '')) return true;
  return false;
};
const rubberDraws = (root) => {
  const draws = [];
  root.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    const role = object.material.userData?.appearanceRole;
    if (role === 'tireRubber' || role === 'hullRubber') draws.push({ object, material: object.material, role, gear: gearOf(object) });
  });
  return draws;
};
const paintMode = (material) => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  return shader.uniforms.uApPaint?.value;
};

try {
  for (const id of ['t72b3', 'm2a2_bradley']) {
    await ensureTankBuilder(id);
    const visual = createTank(id, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
      battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' });
    const draws = rubberDraws(visual.root);
    const hull = draws.filter((draw) => !draw.gear), gear = draws.filter((draw) => draw.gear);
    assert.ok(hull.length > 0 && gear.length > 0, `${id}: hull rubber and tyres both drawn`);
    assert.ok(hull.every((draw) => draw.role === 'hullRubber' && draw.material.name === 'cot:hull-rubber'), `${id}: every hull rubber draw wears the hull rubber`);
    assert.ok(gear.every((draw) => draw.role === 'tireRubber'), `${id}: the tyres keep the tyre rubber`);
    const tyre = gear.find((draw) => draw.material.name === 'cot:tire-rubber').material;
    const skirt = hull[0].material;
    for (const key of ['type', 'roughness', 'metalness', 'envMapIntensity', 'map', 'roughnessMap', 'normalMap', 'transparent', 'side']) {
      assert.equal(skirt[key], tyre[key], `${id}: the hull rubber's ${key} is the tyres'`);
    }
    assert.equal(skirt.color.getHex(), tyre.color.getHex(), `${id}: the tyres' colour`);
    assert.equal(skirt.emissive.getHex(), tyre.emissive.getHex(), `${id}: the tyres' emissive`);
    assert.deepEqual(skirt.defines, tyre.defines, `${id}: the tyres' defines (COT_NO_FIELD_DUST)`);
    assert.equal(skirt.userData.rubberSurface, true, `${id}: the rubber's own detail maps' UVs`);
    const burn = makeBurnUniforms(3);
    applyBurnHook(skirt, burn);
    applyBurnHook(tyre, burn);
    assert.equal(skirt.customProgramCacheKey(), tyre.customProgramCacheKey(), `${id}: one program for both`);
    assert.equal(paintMode(skirt), 4, `${id}: the armour paint colours the hull rubber by where it sits, its grain flat`);
    assert.equal(paintMode(tyre), 0, `${id}: and leaves the tyres bare`);
    visual.dispose();
  }
  // a geometry receipt keeps the one rubber
  {
    const receipt = createTank('t72b3', null, { proceduralOnly: true, geometryReceipt: true });
    const draws = rubberDraws(receipt.root);
    assert.ok(draws.some((draw) => !draw.gear) && draws.every((draw) => draw.role === 'tireRubber'), 'a geometry receipt keeps the tyre rubber everywhere');
    receipt.dispose();
  }
} finally {
  restoreCanvas();
}
console.log('hullRubber.selftest: the hull rubber is its own material, the tyres\' finish and program, painted by place; the tyres bare');
