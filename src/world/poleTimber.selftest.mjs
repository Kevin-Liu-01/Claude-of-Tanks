// The telegraph poles' timber (the scenery lane, after gauntlet wave 57): the sourced pole's wood and the distance
// pole's are found by their baked tones and only those — the insulators and the steel keep theirs; a piece's grain axis
// runs up the shaft, the pegs and the braces and along the arms; a cached geometry is never marked twice; the hook
// anchors on the grime hook, paints the timber ahead of the grime and the snow, hashes an instance's place for its tone
// and samples its grain with the seam-free gradients; the producer clones the cached sourced pole, rounds its shaft,
// marks both models and gives both meshes the poles' own material and program. Wave 66 ("a straight, flat-faced,
// constant-width beam"): the near pole's shaft is a twelve-sided frustum with smooth normals, tapered to the collar;
// the distance pole's trunk ten-sided.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeTelephonePoleDistanceGeometry } from './propGeometry.ts';
import { applyPoleTimberHook, markPoleTimber, roundPoleShaft } from './poleTimber.ts';

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
  assert.equal(trunk.length, 20, 'the ten-sided trunk');
  assert.equal(arms.length, 16, 'two arms, four long faces of two triangles each');
  for (const f of trunk) assert.deepEqual(f.axes, [1, 1, 1]);
  for (const f of arms) assert.deepEqual(f.axes, [2, 2, 2]);
  assert.ok(ceramic > 50, `insulators ${ceramic}`);
  assert.equal(distance.index, null, 'the distance pole stays a triangle list');
  distance.dispose();
}

// --- the round shaft: the near post as the build slices it (the source's z > -1), its eight flat faces out, a smooth
// twelve-sided frustum in
{
  const P = pole.positions, keep = [];
  for (let t = 0; t < pole.indices.length; t += 3) {
    const v = [pole.indices[t], pole.indices[t + 1], pole.indices[t + 2]];
    if (v.every((i) => P[i * 3 + 2] > -1)) keep.push(...v);
  }
  const post = new THREE.BufferGeometry();
  post.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pole.positions), 3));
  post.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(pole.normals), 3));
  post.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(pole.colors), 3));
  post.setIndex(new THREE.BufferAttribute(Uint16Array.from(keep), 1));
  const trianglesBefore = keep.length / 3;
  assert.equal(roundPoleShaft(post), post, 'rounded in place');
  const p = post.getAttribute('position'), n = post.getAttribute('normal'), c = post.getAttribute('color'), index = post.index.array;
  assert.equal(index.length / 3, trianglesBefore - 16 + 24, 'the eight flat faces (sixteen triangles) out, twelve round in');
  const isWood = (v) => near(c.getX(v), sourceTone[0], 0.012) && near(c.getY(v), sourceTone[1], 0.012) && near(c.getZ(v), sourceTone[2], 0.012);
  let shaftTris = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
  const shaftVerts = new Set();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const v = [index[t], index[t + 1], index[t + 2]];
    const ys = v.map((i) => p.getY(i));
    if (!v.every(isWood) || Math.max(...ys) - Math.min(...ys) < 0.8 * (maxY - minY)) continue;
    shaftTris++;
    v.forEach((i) => shaftVerts.add(i));
    e1.set(p.getX(v[1]) - p.getX(v[0]), p.getY(v[1]) - p.getY(v[0]), p.getZ(v[1]) - p.getZ(v[0]));
    e2.set(p.getX(v[2]) - p.getX(v[0]), p.getY(v[2]) - p.getY(v[0]), p.getZ(v[2]) - p.getZ(v[0]));
    fn.crossVectors(e1, e2).normalize();
    for (const i of v) assert.ok(fn.x * n.getX(i) + fn.y * n.getY(i) + fn.z * n.getZ(i) > 0.9, 'the shaft faces outward, its normals with its faces');
  }
  assert.equal(shaftTris, 24, 'twelve sides, two triangles each');
  assert.equal(shaftVerts.size, 24, 'two rings of twelve, every side sharing its edges (smooth normals)');
  const rings = [...shaftVerts].map((i) => [p.getX(i), p.getY(i), p.getZ(i)]);
  const y0 = Math.min(...rings.map((q) => q[1])), y1 = Math.max(...rings.map((q) => q[1]));
  const cx = rings.reduce((a, q) => a + q[0], 0) / rings.length, cz = rings.reduce((a, q) => a + q[2], 0) / rings.length;
  const radius = (y) => Math.max(...rings.filter((q) => Math.abs(q[1] - y) < 1e-4).map((q) => Math.hypot(q[0] - cx, q[2] - cz)));
  assert.ok(Math.abs(radius(y0) - 0.363) < 0.01, `the butt keeps the post's girth (${radius(y0).toFixed(3)})`);
  assert.ok(Math.abs(radius(y1) / radius(y0) - 0.7) < 1e-3, 'tapered to seven tenths at the collar');
  assert.ok(Math.hypot(cx, cz) < 0.02 && y0 < 0.01 && y1 > 10.4, 'on the post\'s own axis, butt to collar');
  for (const i of shaftVerts) assert.ok(n.getY(i) > 0.005 && n.getY(i) < 0.05, 'the normals lean with the taper');
  markPoleTimber(post);
  const axis = post.getAttribute('aPoleWood');
  for (const i of shaftVerts) assert.equal(axis.getX(i), 1, 'the round shaft is timber, its grain up the pole');
  assert.throws(() => roundPoleShaft(post), /before marking/, 'a marked pole is never rounded again');
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
assert.match(source, /markPoleTimber\(roundPoleShaft\(bakedGeometry\('telephone_pole_polygoogle',[\s\S]{0,160}\)\.clone\(\)\)\)/,
  'the cached sourced pole is cloned, its shaft rounded, then marked');
assert.match(source, /pole: new THREE\.MeshStandardMaterial\(\{ vertexColors: true, roughness: 0\.9, metalness: 0 \}\)/);
assert.match(source, /const poleHook: MaterialShaderHook = \(shader\) => \{ grimeHook\(shader\); applyPoleTimberHook\(shader, rockDressing\.dust >= 0\.5\); \};/);
assert.match(source, /materialKind === 'pole' \? poleHook/);
assert.match(source, /poleFullIM = new THREE\.InstancedMesh\(e\.geo, mats\.pole, e\.list\.length\);/);
assert.match(source, /markPoleTimber\(makeTelephonePoleDistanceGeometry\(\)\), mats\.pole, e\.list\.length\);/);
console.log('poleTimber self-test passed: the sourced and distance poles\' timber found by tone (insulators and steel kept), shaft and arm grain axes, no double marking, the hook ahead of the grime with seam-free grain gradients, the producer\'s clone and material');
