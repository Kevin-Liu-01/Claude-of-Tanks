// stoneWalls.selftest — the dry-stone field walls (the props' module) irregular, coped and weathered by world place (the
// scenery lane, b14; gauntlet wave 97: "stacked brown rectangular slabs of near-identical size and thickness with a
// dead-level top"). Pinned:
//   1. the module (inhabitKit dryStoneModule through the wallstone build): its face stones of many sizes (their heights
//      and lengths spread wide), its top a coping of stones on edge of their own heights, every part tagged with its
//      centre and kind (aStone), the centres fitted with the module into the old envelope (the collider's box), the
//      hearting's top under the copes;
//   1b. (b26; gauntlet wave 177, Saltwind: "neat stacks of uniform rectangular slabs with upright coping"; the
//      coordinator: "Saltwind needs one suhozid kit") the suhozid module (a limestone map's): in the dry-stone module's
//      envelope, every part tagged, its faces laid by the coursing law in stones of many sizes, its top a crown of
//      rubble lumps lying on the wall (none on edge) of their own heights over the hearting, and its courses running on
//      across the module's ends (a stone over an end cut into two parts that meet the next module's as one); the run's
//      heads, corner piers and breach stubs on the same law, carrying only what the static bucket merges, in budget;
//   2. the material (stoneWallShader.ts): its hook applies to three's standard and depth shaders, the settling bounded
//      (STONE_SETTLE_M) and only ever down, a stone moved whole by its centre's place, the copes dropped only where
//      enabled (never under a snow load), lichen by world place;
//   3. the wiring (props.ts): the field print's hook carries it, the wallstone pool's shadows run it, the snow load is
//      tagged to settle with the wall.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES, DRY_STONE_KIND, WALL_SEG, bWallSuhozid, bWallSuhozidBroken, buildDryStoneStub, buildDryStoneWallHead } from './maps/inhabitKit.ts';
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

// 1b. the suhozid module, the heads, the piers and the stubs
const partsOf = (g) => {
  const p = g.attributes.position, tag = g.getAttribute('aStone'), parts = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${tag.getX(i).toFixed(4)},${tag.getY(i).toFixed(4)},${tag.getZ(i).toFixed(4)},${tag.getW(i)}`;
    let s = parts.get(key);
    if (!s) parts.set(key, s = { kind: tag.getW(i), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    for (const [a, v] of [p.getX(i), p.getY(i), p.getZ(i)].entries()) { s.min[a] = Math.min(s.min[a], v); s.max[a] = Math.max(s.max[a], v); }
  }
  return [...parts.values()];
};
for (const seed of [7, 11, 2049]) {
  const g = bWallSuhozid(mulberry32(seed)), dry = DESTRUCTIBLE_TYPES.wallstone.build(mulberry32(seed));
  g.computeBoundingBox(); dry.computeBoundingBox();
  const tag = g.getAttribute('aStone');
  assert.ok(tag && tag.count === g.attributes.position.count, 'every vertex of the suhozid carries its stone\'s centre and kind');
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(g.boundingBox.min.getComponent(a) - dry.boundingBox.min.getComponent(a)) < 1e-4
      && Math.abs(g.boundingBox.max.getComponent(a) - dry.boundingBox.max.getComponent(a)) < 1e-4, 'in the dry-stone module\'s envelope (the collider\'s box)');
  }
  const parts = partsOf(g);
  for (const s of parts) assert.ok(Object.values(DRY_STONE_KIND).includes(s.kind), `a known kind (${s.kind})`);
  const faces = parts.filter((s) => s.kind === DRY_STONE_KIND.face), tops = parts.filter((s) => s.kind === DRY_STONE_KIND.cope);
  const heights = faces.map((s) => s.max[1] - s.min[1]), lengths = faces.map((s) => s.max[2] - s.min[2]);
  assert.ok(faces.length > 25, `face stones (${faces.length})`);
  assert.ok(cv(heights) > 0.3 && cv(lengths) > 0.4, `stones of many sizes (heights cv ${cv(heights).toFixed(2)}, lengths cv ${cv(lengths).toFixed(2)})`);
  assert.ok(tops.length >= 6, `a crown of rubble top stones (${tops.length})`);
  const onEdge = tops.filter((s) => (s.max[2] - s.min[2]) < (s.max[1] - s.min[1])).length;
  assert.ok(onEdge / tops.length < 0.35, `the top stones lie on the wall, none of the crown a coping on edge (${onEdge} of ${tops.length} thinner along the wall than tall: the small wedges)`);
  const topY = tops.map((s) => s.max[1]);
  assert.ok(Math.max(...topY) - Math.min(...topY) > 0.06, 'the crown ragged, no dead-level top');
  const core = parts.find((s) => s.kind === DRY_STONE_KIND.core);
  assert.ok(core && core.max[1] < Math.min(...topY), 'the hearting under the top stones');
  // the courses run on across the module's ends: a stone part at one end meets one at the other end, on the same face,
  // over the same heights (the module repeats every three metres)
  const zEnd = g.boundingBox.max.z - 1e-3, zStart = g.boundingBox.min.z + 1e-3;
  const atEnd = faces.filter((s) => s.max[2] >= zEnd), atStart = faces.filter((s) => s.min[2] <= zStart);
  let met = 0;
  for (const e of atEnd) {
    const side = Math.sign(e.min[0] + e.max[0]);
    if (atStart.some((b) => Math.sign(b.min[0] + b.max[0]) === side
      && Math.min(e.max[1], b.max[1]) - Math.max(e.min[1], b.min[1]) > 0.8 * Math.min(e.max[1] - e.min[1], b.max[1] - b.min[1]))) met++;
  }
  assert.ok(atEnd.length >= 4 && met >= atEnd.length * 0.7, `the courses run on across the module's end (${met} of ${atEnd.length} end stones meet the next module's)`);
  void WALL_SEG;
  const broken = bWallSuhozidBroken(mulberry32(seed));
  broken.computeBoundingBox();
  assert.ok(broken.getAttribute('aStone') && broken.boundingBox.max.y < 0.62, 'its remnant low, tagged');
  for (const geo of [g, dry, broken]) geo.dispose();
}
for (const [name, g, budget, height] of [
  ['a head', buildDryStoneWallHead(1234567, 0.46, 1.1), 700, 1.1], ['a corner pier', buildDryStoneWallHead(7654321, 0.97, 1.5), 1200, 1.5],
  ['a breach stub', buildDryStoneStub(424242, 0.46, 0.45, 1.2), 600, 0.45],
]) {
  assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv'], `${name} carries what the static bucket merges`);
  const tris = g.attributes.position.count / 3;
  assert.ok(tris <= budget, `${name} within its budget (${tris} of ${budget} triangles)`);
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.y < height * 1.12 + 0.02 && g.boundingBox.min.y > -0.06, `${name} stands about its height (${g.boundingBox.max.y.toFixed(3)} m)`);
  g.dispose();
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

console.log('stoneWalls.selftest: stones of many sizes under a coping on edge, every stone tagged and fitted; the suhozid laid by the coursing law under a crown of rubble, its courses running on across its ends; heads, piers and stubs on the same law; settling, dropped copes and lichen by world place, in the shadows too; wired');
