// The hull's rubber (262; Main's ruling 2026-10-28: the rear rubber skirts take their own material role): on a rendered
// build every static rubber draw off the running gear (skirts, flaps, mudguards, mats) wears its own clone of the tyre
// rubber, role hullRubber (tankFactoryCore separateHullRubber), so the scoped armour paint colours it by where it sits,
// its grain flat under the colour (materials.ts armorPaintMode 4), and leaves the tyres bare (0). The clone is the tyres'
// rubber in every other way: the same finish, maps, defines and program, so it draws and compiles as it did. A geometry
// receipt keeps the one rubber.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { betweenBuilds } from '../../tools/build-loop-yield.mjs';

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
const compiled = (material) => {
  const shader = { uniforms: {}, defines: material.defines, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  return shader.fragmentShader;
};
const paintMode = (material) => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  return shader.uniforms.uApPaint?.value;
};

try {
  for (const id of ['t72b3', 'm2a2_bradley']) {
    await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
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
      assert.ok(skirt[key] === tyre[key], `${id}: the hull rubber's ${key} is the tyres'`);
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
    // 274 (t80-skirts-274): the rubber's tile broken up (materials.ts RUBBER_TILES_GLSL) on the tyres and the hull rubber
    // alike, each map's chunk between the sampler swap and its restore, the chunks' include lines kept for the burn and
    // paint hooks (the paint's roughness flattening still lands after its chunk)
    for (const [name, material] of [['hull rubber', skirt], ['tyres', tyre]]) {
      assert.equal(material.defines.COT_RUBBER_TILES, 1, `${id}: the ${name} break up the tile`);
      const fragment = compiled(material);
      assert.ok(fragment.includes('vec4 cotRubberTexture( sampler2D t, vec2 uv )'), `${id}: the ${name} sample through cotRubberTexture`);
      for (const chunk of ['map_fragment', 'roughnessmap_fragment', 'normal_fragment_maps']) {
        const at = fragment.indexOf(`#include <${chunk}>`);
        assert.ok(at > 0, `${id}: the ${name} keep the ${chunk} include`);
        assert.ok(fragment.lastIndexOf('#define texture2D cotRubberTexture', at) > fragment.lastIndexOf('#define texture2D texture\n', at),
          `${id}: the ${name}' ${chunk} samples through cotRubberTexture`);
        assert.ok(fragment.indexOf('#define texture2D texture\n', at) > at, `${id}: and the swap ends after it`);
      }
      assert.ok(fragment.includes('roughnessFactor = mix( roughnessFactor, 0.85, apFlat );'), `${id}: the ${name} keep the paint's flattening`);
    }
    visual.dispose();
  }
  // a painted plate compiles without the rubber's tile (only COT_RUBBER_TILES takes it)
  {
    await ensureTankBuilder('t72b3');
    const visual = createTank('t72b3', null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low' });
    let plate = null;
    visual.root.traverse((object) => {
      if (!plate && object.isMesh && !Array.isArray(object.material) && object.material.userData?.appearanceRole === 'armorPaint') plate = object.material;
    });
    assert.ok(plate && !('COT_RUBBER_TILES' in (plate.defines ?? {})), 't72b3: the armour paint has no rubber tile switch');
    assert.ok(!compiled(plate).includes('cotRubberTexture'), 't72b3: and its program no rubber tile text');
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
console.log('hullRubber.selftest: the hull rubber is its own material, the tyres\' finish and program, painted by place; the tyres bare; both rubbers break up their tile, nothing else does');
