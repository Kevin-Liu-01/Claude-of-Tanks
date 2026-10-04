// The telegraph poles' timber (the scenery lane, after gauntlet wave 57): the sourced pole's wood and the distance
// pole's are found by their baked tones and only those — the insulators and the steel keep theirs; a piece's grain axis
// runs up the shaft, the pegs and the braces and along the arms; a cached geometry is never marked twice; the hook
// anchors on the grime hook, paints the timber ahead of the grime and the snow, hashes an instance's place for its tone
// and samples its grain with the seam-free gradients; the producer clones the cached sourced pole, marks both models
// and gives both meshes the poles' own material and program.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeTelephonePoleDistanceGeometry } from './propGeometry.ts';
import { applyPoleTimberHook, markPoleTimber } from './poleTimber.ts';

const sourceTone = [0.41, 0.34, 0.21];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- the sourced pole, as the props archive bakes it (both posts of the segment, source units)
const models = JSON.parse(readFileSync(new URL('./props-models.json', import.meta.url), 'utf8'));
const pole = models.telephone_pole_polygoogle;
assert.ok(pole, 'the sourced pole is in the props archive');
const sourced = new THREE.BufferGeometry();
sourced.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pole.positions), 3));
sourced.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(pole.colors), 3));
sourced.setIndex(new THREE.BufferAttribute(Uint16Array.from(pole.indices), 1));
const before = Float32Array.from(pole.colors);
assert.equal(markPoleTimber(sourced), sourced, 'marked in place');
/** Each wood triangle's extents and its corners' axes (the models are flat-shaded: a face is its own piece). */
function woodTriangles(geometry, woodAt) {
  const p = geometry.getAttribute('position'), axis = geometry.getAttribute('aPoleWood'), index = geometry.index;
  const corners = index ? index.count : p.count, out = [];
  for (let t = 0; t < corners; t += 3) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    if (!v.every(woodAt)) continue;
    const ext = (get) => Math.max(...v.map(get)) - Math.min(...v.map(get));
    out.push({ v, dx: ext((i) => p.getX(i)), dy: ext((i) => p.getY(i)), axes: v.map((i) => axis.getX(i)) });
  }
  return out;
}
{
  const c = sourced.getAttribute('color'), axis = sourced.getAttribute('aPoleWood');
  const wasWood = (i) => near(before[i * 3], sourceTone[0], 0.012) && near(before[i * 3 + 1], sourceTone[1], 0.012)
    && near(before[i * 3 + 2], sourceTone[2], 0.012);
  let timber = 0;
  for (let i = 0; i < axis.count; i++) {
    const a = axis.getX(i);
    if (!wasWood(i)) {
      assert.equal(a, 0, `vertex ${i}: an insulator or the steel is not timber`);
      for (let k = 0; k < 3; k++) assert.equal(c.getComponent(i, k), before[i * 3 + k], `vertex ${i} keeps its baked tone`);
      continue;
    }
    timber++;
    assert.ok(a === 1 || a === 2, `vertex ${i}: timber carries a grain axis`);
    for (let k = 0; k < 3; k++) assert.equal(c.getComponent(i, k), 1, `vertex ${i}: the timber is white (the shader paints it)`);
  }
  assert.equal(timber, 514, 'every timber vertex of the segment is found');
  const faces = woodTriangles(sourced, wasWood);
  const shaft = faces.filter((f) => f.dy > 10), arms = faces.filter((f) => f.dx > 5);
  assert.equal(shaft.length, 32, 'two posts, eight faces of two triangles each');
  assert.equal(arms.length, 32, 'four arms, four long faces of two triangles each');
  for (const f of shaft) assert.deepEqual(f.axes, [1, 1, 1], 'a shaft face\'s grain runs up the pole');
  for (const f of arms) assert.deepEqual(f.axes, [2, 2, 2], 'an arm face\'s grain runs along the arm');
  for (const f of faces) assert.ok(f.axes.every((a) => a === f.axes[0]), 'a face carries one axis (no grain seam inside it)');
}
assert.throws(() => markPoleTimber(sourced), /already marked/, 'a marked (cached) geometry is never marked again');

// --- the distance pole: its trunk up, its arms across, its insulators kept
const distance = markPoleTimber(makeTelephonePoleDistanceGeometry());
{
  const c = distance.getAttribute('color'), axis = distance.getAttribute('aPoleWood');
  let ceramic = 0;
  for (let i = 0; i < axis.count; i++) {
    if (axis.getX(i) === 0) {
      ceramic++;
      assert.ok(near(c.getX(i), 0.14) && near(c.getY(i), 0.21) && near(c.getZ(i), 0.16), `vertex ${i}: only the insulators stay`);
    } else assert.ok(c.getX(i) === 1 && c.getY(i) === 1 && c.getZ(i) === 1, `vertex ${i}: the timber is white`);
  }
  const faces = woodTriangles(distance, (i) => axis.getX(i) > 0);
  const trunk = faces.filter((f) => f.dy > 7), arms = faces.filter((f) => f.dx > 2.5);
  assert.equal(trunk.length, 14, 'the seven-sided trunk');
  assert.equal(arms.length, 16, 'two arms, four long faces of two triangles each');
  for (const f of trunk) assert.deepEqual(f.axes, [1, 1, 1]);
  for (const f of arms) assert.deepEqual(f.axes, [2, 2, 2]);
  assert.ok(ceramic > 50, `insulators ${ceramic}`);
  assert.equal(distance.index, null, 'the distance pole stays a triangle list');
  distance.dispose();
}

// --- the hook, over the grime hook's anchors
const grimed = {
  uniforms: {},
  vertexShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\n#include <worldpos_vertex>\n{\n  vec4 gw = vec4(transformed, 1.0);\n  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}',
  fragmentShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;\n#include <map_fragment>\n{ grime; snow; }\n#include <color_fragment>\n',
};
for (const arid of [false, true]) {
  const shader = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
  applyPoleTimberHook(shader, arid);
  assert.deepEqual(Object.keys(shader.uniforms), ['uPoleArid']);
  assert.equal(shader.uniforms.uPoleArid.value, arid ? 1 : 0);
  const v = shader.vertexShader, f = shader.fragmentShader;
  assert.match(v, /attribute float aPoleWood;\nvarying float vPoleWood;\nvarying vec3 vPoleL;\nvarying float vPoleSeed;/);
  assert.match(v, /vPoleL = transformed;/, 'the grain and the foot read the pole\'s own frame (a toppled pole keeps them)');
  assert.match(v, /vPoleSeed = 0\.5;\n  #ifdef USE_INSTANCING\n  vPoleSeed = fract\(sin\(dot\(instanceMatrix\[3\]\.xz/, 'an instance hashes its place: both LOD meshes agree');
  assert.match(f, /uniform sampler2D uGrime;\nvarying float vPoleWood;[\s\S]*uniform float uPoleArid;/);
  const timber = f.indexOf('if (vPoleWood > 0.5)'), grime = f.indexOf('{ grime; snow; }'), color = f.indexOf('#include <color_fragment>');
  assert.ok(f.indexOf('#include <map_fragment>') < timber && timber < grime && grime < color,
    'the timber is painted ahead of the grime, the weathering and the snow load, and ahead of the vertex tone');
  const body = f.slice(timber, grime);
  assert.equal((body.match(/texture2D\(/g) || []).length, 0, 'every grain sample takes its gradients (the shaft\'s seam keeps its mip)');
  assert.ok((body.match(/textureGrad\(uGrime,/g) || []).length >= 5);
  assert.match(body, /atan\(poleR\.y, poleR\.x\) \* 0\.63662/, 'four tiles round the shaft: the seam closes');
  assert.match(body, /poleCkW = max\(0\.022, poleCkPx\)[\s\S]*\(0\.022 \/ poleCkW\)/, 'a check under a pixel fades to its share of it');
  assert.match(body, /poleFoot = \(1\.0 - smoothstep\(poleEdge - 0\.22, poleEdge \+ 0\.04, vPoleL\.y\)\) \* poleShaft/);
  assert.match(body, /diffuseColor\.rgb \*= poleTone \* poleGrain \* \(1\.0 - 0\.6 \* poleCheck\);\n}/);
}
assert.throws(() => applyPoleTimberHook({ uniforms: {}, vertexShader: '', fragmentShader: '' }, false), /anchor missing/);

// --- the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(source, /markPoleTimber\(bakedGeometry\('telephone_pole_polygoogle',[\s\S]{0,160}\)\.clone\(\)\)/,
  'the cached sourced pole is cloned before it is marked');
assert.match(source, /pole: new THREE\.MeshStandardMaterial\(\{ vertexColors: true, roughness: 0\.9, metalness: 0 \}\)/);
assert.match(source, /const poleHook: MaterialShaderHook = \(shader\) => \{ grimeHook\(shader\); applyPoleTimberHook\(shader, rockDressing\.dust >= 0\.5\); \};/);
assert.match(source, /materialKind === 'pole' \? poleHook/);
assert.match(source, /poleFullIM = new THREE\.InstancedMesh\(e\.geo, mats\.pole, e\.list\.length\);/);
assert.match(source, /markPoleTimber\(makeTelephonePoleDistanceGeometry\(\)\), mats\.pole, e\.list\.length\);/);
console.log('poleTimber self-test passed: the sourced and distance poles\' timber found by tone (insulators and steel kept), shaft and arm grain axes, no double marking, the hook ahead of the grime with seam-free grain gradients, the producer\'s clone and material');
