// stoneWalls.selftest — the dry-stone field walls (the props' module) irregular, coped and weathered by world place (the
// scenery lane, b14; gauntlet wave 97: "stacked brown rectangular slabs of near-identical size and thickness with a
// dead-level top"). Pinned:
//   1. the module (inhabitKit dryStoneModule through the wallstone build): its face stones of many sizes (their heights
//      and lengths spread wide), its top a coping of stones on edge of their own heights, every part tagged with its
//      centre and kind (aStone), the centres fitted with the module into the old envelope (the collider's box), the
//      hearting's top under the copes;
//   2. the material (stoneWallShader.ts): its hook applies to three's standard and depth shaders, the settling bounded
//      (STONE_SETTLE_M) and only ever down, a stone moved whole by its centre's place, the copes dropped only where
//      enabled (never under a snow load), lichen by world place;
//   3. the wiring (props.ts): the field print's hook carries it, the wallstone pool's shadows run it, the snow load is
//      tagged to settle with the wall.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES, DRY_STONE_KIND } from './maps/inhabitKit.ts';
import { STONE_SETTLE_M, applyStoneWallHook, createStoneWallDepthMaterial, stoneShapeFor } from './stoneWallShader.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const cv = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m; };

// 1. the module
for (const seed of [7, 11, 2049]) {
  const g = DESTRUCTIBLE_TYPES.wallstone.build(mulberry32(seed));
  g.computeBoundingBox();
  const p = g.attributes.position, tag = g.getAttribute('aStone');
  assert.ok(tag && tag.itemSize === 4 && tag.count === p.count, 'every vertex carries its stone\'s centre and kind');
  const stones = new Map(); // centre key -> { kind, min, max }
  for (let i = 0; i < p.count; i++) {
    const kind = tag.getW(i);
    assert.ok(Object.values(DRY_STONE_KIND).includes(kind), `a known kind (${kind})`);
    const key = `${tag.getX(i).toFixed(4)},${tag.getY(i).toFixed(4)},${tag.getZ(i).toFixed(4)},${kind}`;
    let s = stones.get(key);
    if (!s) stones.set(key, s = { kind, c: [tag.getX(i), tag.getY(i), tag.getZ(i)], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    for (const [a, v] of [p.getX(i), p.getY(i), p.getZ(i)].entries()) { s.min[a] = Math.min(s.min[a], v); s.max[a] = Math.max(s.max[a], v); }
  }
  const box = g.boundingBox;
  for (const s of stones.values()) {
    if (s.kind === DRY_STONE_KIND.core) continue;
    // the centre went through the envelope fit with its stone: it lies inside the stone's own box (a little slack for
    // the clamp at the module's ends)
    for (let a = 0; a < 3; a++) assert.ok(s.c[a] > s.min[a] - 0.05 && s.c[a] < s.max[a] + 0.05, 'a stone\'s centre inside its stone');
  }
  const faces = [...stones.values()].filter((s) => s.kind === DRY_STONE_KIND.face);
  const copes = [...stones.values()].filter((s) => s.kind === DRY_STONE_KIND.cope);
  const heights = faces.map((s) => s.max[1] - s.min[1]), lengths = faces.map((s) => s.max[2] - s.min[2]);
  assert.ok(faces.length > 25, `face stones (${faces.length})`);
  assert.ok(cv(heights) > 0.3 && cv(lengths) > 0.4, `stones of many sizes (heights cv ${cv(heights).toFixed(2)}, lengths cv ${cv(lengths).toFixed(2)})`);
  assert.ok(copes.length >= 15, `a coping of stones on edge (${copes.length} copes)`);
  const copeTops = copes.map((s) => s.max[1]);
  assert.ok(Math.max(...copeTops) - Math.min(...copeTops) > 0.08, `the copes' tops ragged (${(Math.max(...copeTops) - Math.min(...copeTops)).toFixed(3)} m), no dead-level top`);
  const thin = copes.filter((s) => (s.max[2] - s.min[2]) < (s.max[1] - s.min[1])).length;
  assert.ok(thin / copes.length > 0.6, 'most copes stand on edge (thinner along the wall than they stand tall)');
  const core = [...stones.values()].find((s) => s.kind === DRY_STONE_KIND.core);
  assert.ok(core && core.max[1] < Math.min(...copeTops), 'the hearting stops under the copes');
  assert.ok(Math.abs(box.min.y) < 0.02 && box.max.y > 1.0 && box.max.y < 1.3, `the module in its envelope (top ${box.max.y.toFixed(3)} m)`);
}

// 2. the material
{
  const standard = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  standard.vertexShader = standard.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
  standard.fragmentShader = standard.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
  const shape = { value: new THREE.Vector4() };
  applyStoneWallHook(standard, shape);
  assert.equal(standard.uniforms.uStoneShape, shape);
  assert.match(standard.vertexShader, /attribute vec4 aStone;/);
  assert.match(standard.vertexShader, /transformed\.y -= uStoneShape\.y \* cotStoneSettle\(cotC\.xz\) \* cotUp \* cotUp;/, 'a stone settles whole by its centre\'s place, the top most');
  assert.match(standard.vertexShader, /if \(cotKind > 2\.5 && uStoneShape\.z > 0\.5 && cotStoneGone\(cotC\.xz\) > 0\.5\) transformed = aStone\.xyz;/, 'a cope drops only where enabled');
  // (a GLSL ES 3.00 reserved word as a name fails the program: the wall drew nothing in the preview with 'patch')
  const own = standard.fragmentShader.slice(standard.fragmentShader.indexOf('crustose'), standard.fragmentShader.indexOf('crustose') + 1300)
    + standard.vertexShader.slice(standard.vertexShader.indexOf('uniform vec4 uStoneShape'), standard.vertexShader.indexOf('uniform vec4 uStoneShape') + 1000);
  assert.ok(!/\b(patch|sample|subroutine|resource|filter|input|output|common|partition|active)\b/.test(own.replace(/\/\/.*$/gm, '')), 'no GLSL ES reserved word as a name');
  assert.ok(STONE_SETTLE_M > 0 && STONE_SETTLE_M <= 0.08, `the settling at most ${STONE_SETTLE_M} m`);
  const v = stoneShapeFor(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1.17, 1)), true);
  assert.ok(Math.abs(v.x - 1.17) < 1e-9 && v.y === STONE_SETTLE_M && v.z === 0, 'under a snow load no cope drops (its snow would float)');
  const depth = createStoneWallDepthMaterial(new THREE.Texture(), shape);
  const ds = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  depth.onBeforeCompile(ds);
  assert.ok(ds.vertexShader.includes('cotStoneSettle') && ds.uniforms.uStoneShape === shape, 'the shadow pass settles and drops the same stones');
}

// 3. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /const fieldStoneHook: MaterialShaderHook = \(shader\) => \{\n\s*grimeHook\(shader\);\n\s*applyStoneWallHook\(shader, stoneShape\);/, 'the field print\'s hook');
  assert.match(props, /if \(material === mats\.fieldStone && kind === 'wallstone' && geoI\.getAttribute\('aStone'\)\) \{[\s\S]{0,400}imI\.customDepthMaterial = depth;/, 'the wallstone pool\'s shadows');
  assert.match(props, /for \(let i = 0; i < n; i\+\+\) tag\[i \* 4 \+ 3\] = DRY_STONE_KIND\.snow;/, 'the snow load settles with the wall');
}

console.log('stoneWalls.selftest: stones of many sizes under a coping on edge, every stone tagged and fitted; settling, dropped copes and lichen by world place, in the shadows too; wired');
