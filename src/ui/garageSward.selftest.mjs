// garage-env-276 (class 2): the battle's own sward on the Garage yards (garageEnvironmentKit.ts, tallGrass.ts nearOnly).
// 1. every outdoor pack draws the battle sward exactly where the battle draws one (a grass biome: not desert, not
//    badlands), at the Garage's density, inside its triangle share of the pack budget;
// 2. no blade stands on the working floors (the apron) or past the patch's edge;
// 3. the sward is no camera obstacle (the battle clears its blades by the lens): the spring arm's obstacles are the same
//    with it as without, and the static tufts stay beside it (the battle's card tufts' stand-in).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { resolveGroundReduxProfile } from '../world/groundRedux.ts';
import { getGarageTerrainPatch } from './garageTerrainPatches.generated.ts';
import { buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets, GARAGE_GRASS_QUALITY } from './garageEnvironmentKit.ts';

const SWARD_TRIANGLES = 40_000;
const assets = createGarageEnvironmentAssetLibrary({});
const rows = [];
for (const variant of GARAGE_VARIANTS.filter((v) => v.architecture !== 'field_shed')) {
  await prepareGarageEnvironmentAssets(assets, variant);
  const build = buildGarageEnvironment({}, assets, variant, () => {});
  const grows = !!resolveGroundReduxProfile(variant.mapId).grass;
  const group = build.root.getObjectByName('battle_sward');
  // 1.
  assert.equal(!!group, grows, `${variant.id}: the battle sward is drawn exactly where the battle draws one`);
  assert.equal(build.stats.battleSward > 0, grows, `${variant.id}: ${build.stats.battleSward} clumps`);
  assert.ok(build.stats.groundCover >= 48, `${variant.id}: the static tufts stay beside it`);
  let triangles = 0;
  if (group) {
    const near = group.children.find((child) => child.isInstancedMesh && child.visible && child.count > 0);
    assert.ok(near, `${variant.id}: its near ring drew`);
    assert.equal(group.children.filter((child) => child.isInstancedMesh && child.visible && child.count > 0).length, 1,
      `${variant.id}: the near ring alone (no mid or far draw)`);
    const perClump = near.geometry.index ? near.geometry.index.count / 3 : near.geometry.attributes.position.count / 3;
    triangles = perClump * near.count;
    assert.ok(triangles <= SWARD_TRIANGLES, `${variant.id}: ${triangles} sward triangles within its share`);
    // 2.
    const patch = getGarageTerrainPatch(variant.mapId), m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let index = 0; index < near.count; index += 1) {
      near.getMatrixAt(index, m);
      p.setFromMatrixPosition(m);
      assert.ok(!(Math.abs(p.x) < 15 && Math.abs(p.z) < 12.5), `${variant.id}: clump ${index} on the apron (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      assert.ok(Math.abs(p.x) <= patch.sizeXM / 2 && Math.abs(p.z) <= patch.sizeZM / 2, `${variant.id}: clump ${index} past the patch`);
    }
    // 3.
    assert.equal(group.userData.cameraTransparent, true, `${variant.id}: the sward is no camera obstacle`);
    const obstacles = build.cameraObstacles.length;
    assert.ok(obstacles < 2000, `${variant.id}: the spring arm took no blade (${obstacles} obstacles)`);
  }
  rows.push(`${variant.mapId} ${build.stats.battleSward} clumps, ${triangles} triangles`);
  build.dispose();
}
assets.dispose();
console.log(`garageSward.selftest: the battle sward on every grass yard at ${GARAGE_GRASS_QUALITY} of the battle's density, `
  + `none on desert or badlands, the apron and the patch's edge clear, no camera obstacle PASS\n  ${rows.join('\n  ')}`);
process.exit(0);
