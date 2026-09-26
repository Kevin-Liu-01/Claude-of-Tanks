// Round 75 item 6 (2026-09-26): the fractured boulders — the visual rock stays inside the legacy hull the shards
// carry (no record moves), keeps the legacy triangle count, splits its normals at the cleavage angle and is a
// function of its seed; every battlefield resolves a dressing; the detail tile is bounded; the hook patches the
// grime hook's anchors and nothing else; the producer keeps the legacy hull as the collision proxy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { convexHull2 } from './collision.ts';
import { MAP_IDS } from './maps/index.ts';
import { applyRockShaderHook, fractureRockGeometry, makeRockDetail, projectsInsideHull, rockDressingFor } from './rockDressing.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noise = new SimplexNoise({ random: mulberry32(1337 + 7) });

/** The legacy boulder: a welded icosphere with the props displacement law (a simplified twin of props.ts). */
function legacyBoulder(detail, variant) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const f = 1 + noise.noise3d(v.x * 1.4 + variant * 9, v.y * 1.4, v.z * 1.4) * 0.3 + noise.noise3d(v.x * 3.1, v.y * 3.1 + 40, v.z * 3.1) * 0.13;
    v.multiplyScalar(f); v.y = Math.max(v.y, -0.55);
    p.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { col[i * 3] = 0.3; col[i * 3 + 1] = 0.31 + i * 1e-4; col[i * 3 + 2] = 0.29; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const projected = [];
  for (let i = 0; i < p.count; i++) projected.push([p.getX(i), p.getZ(i)]);
  return { geometry: g, hull: convexHull2(projected), triangles: g.index.count / 3 };
}

const hashOf = (g) => {
  const h = [];
  for (const [name, a] of Object.entries(g.attributes)) h.push(name, Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength).toString('base64').slice(0, 64));
  return h.join('|');
};

for (const [detail, variant] of [[2, 0], [2, 1], [3, 2]]) {
  const legacy = legacyBoulder(detail, variant);
  const rock = fractureRockGeometry(legacy.geometry, variant, noise, mulberry32(2002 + 60 + variant));
  assert.equal(rock.index, null, 'non-indexed: per-corner normals');
  assert.equal(rock.attributes.position.count / 3, legacy.triangles, 'the legacy triangle count');
  assert.ok(rock.attributes.color && rock.attributes.color.count === rock.attributes.position.count, 'the vertex tone expands with the corners');
  assert.ok(projectsInsideHull(rock, legacy.hull), 'every vertex projects inside the legacy hull (the collision proxy)');
  const p = rock.attributes.position, lp = legacy.geometry.attributes.position, n = rock.attributes.normal;
  let legacyMaxR = 0, legacyMinY = Infinity;
  for (let i = 0; i < lp.count; i++) { legacyMaxR = Math.max(legacyMaxR, Math.hypot(lp.getX(i), lp.getY(i), lp.getZ(i))); legacyMinY = Math.min(legacyMinY, lp.getY(i)); }
  let split = 0, shared = 0;
  const byKey = new Map();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    assert.ok(r <= legacyMaxR + 1e-6, 'a vertex never leaves the legacy radius');
    assert.ok(p.getY(i) >= legacyMinY - 1e-6, 'the seated bottom is never cut');
    assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4, 'unit normals');
    const key = `${Math.round(p.getX(i) * 4000)},${Math.round(p.getY(i) * 4000)},${Math.round(p.getZ(i) * 4000)}`;
    const nk = `${n.getX(i).toFixed(3)},${n.getY(i).toFixed(3)},${n.getZ(i).toFixed(3)}`;
    const list = byKey.get(key) ?? []; list.push(nk); byKey.set(key, list);
  }
  for (const list of byKey.values()) { const distinct = new Set(list).size; if (distinct > 1) split++; else if (list.length > 1) shared++; }
  assert.ok(split >= 20, `cleavage edges split corners (${split})`);
  assert.ok(shared >= 20, `rounded shoulders stay smooth (${shared})`);
  assert.equal(hashOf(fractureRockGeometry(legacyBoulder(detail, variant).geometry, variant, noise, mulberry32(2002 + 60 + variant))), hashOf(rock), 'a function of its seed');
  assert.notEqual(hashOf(fractureRockGeometry(legacyBoulder(detail, variant).geometry, variant, noise, mulberry32(9999))), hashOf(rock), 'another seed cuts another rock');
}
const uncut = legacyBoulder(2, 0);
assert.ok(projectsInsideHull(uncut.geometry, uncut.hull), 'the legacy rock is inside its own hull');
const outside = new THREE.BufferGeometry();
outside.setAttribute('position', new THREE.BufferAttribute(new Float32Array([5, 0, 5]), 3));
assert.equal(projectsInsideHull(outside, uncut.hull), false, 'the hull test rejects a point outside');

// --- dressing per battlefield
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null);
  assert.ok(d.moss >= 0 && d.moss <= 1 && d.dust >= 0 && d.dust <= 1, `${mapId}: bounded weights`);
  assert.ok(d.soil.every((c) => c >= 0 && c <= 1), `${mapId}: a soil colour`);
}
assert.ok(rockDressingFor('verdant', null).moss > 0.5 && rockDressingFor('desert', null).dust > 0.5, 'wet maps moss, arid maps dust');
assert.deepEqual([rockDressingFor('winter', null).moss, rockDressingFor('whiteout', null).dust], [0, 0], 'snow maps take neither');
assert.notDeepEqual(rockDressingFor('railyard', (h, s, l) => [0.6, s, l]).soil, rockDressingFor('railyard', null).soil, 'the dirt tone law reaches the soil');

// --- the detail tile
globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
globalThis.document = { createElement() { const canvas = { width: 0, height: 0 }; canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data; } }); return canvas; } };
try {
  const g = makeRockDetail(noise, 4);
  let steps = 0, r;
  do { r = g.next(); if (!r.done) { steps++; assert.deepEqual(r.value, { fine: true, stage: `rock-rows-${steps * 16}` }); } } while (!r.done);
  assert.equal(steps, 16, 'sixteen row checkpoints');
  assert.deepEqual(Object.keys(r.value).sort(), ['albedo', 'normal', 'surface']);
  for (const t of Object.values(r.value)) { assert.equal(t.image.width, 256); assert.equal(t.image.pixels.byteLength, 256 * 256 * 4); }
  assert.equal(r.value.albedo.colorSpace, THREE.SRGBColorSpace);
  const nrm = r.value.normal.image.pixels; let minZ = 1, sumZ = 0;
  for (let i = 0; i < nrm.length; i += 4) { const z = nrm[i + 2] / 127.5 - 1; minZ = Math.min(minZ, z); sumZ += z; }
  assert.ok(minZ > 0.55 && sumZ / (256 * 256) > 0.9, `restrained relief (${minZ.toFixed(2)}, ${(sumZ / 65536).toFixed(3)})`);
  const alb = r.value.albedo.image.pixels; let dark = 0;
  for (let i = 0; i < alb.length; i += 4) if (alb[i] < 140) dark++;
  assert.ok(dark > 500 && dark < alb.length / 4 * 0.35, `fracture lines present but the tile stays near-white (${dark})`);
  for (const t of Object.values(r.value)) t.dispose();
} finally { delete globalThis.ImageData; delete globalThis.document; }

// --- the hook
const grimed = {
  uniforms: {},
  vertexShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\n#include <worldpos_vertex>\n{\n  vGrimeW = vec3(0.0);\n  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}',
  fragmentShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;\n#include <map_fragment>\n{ grime }\n#include <color_fragment>\n#include <normal_fragment_begin>\n#include <normal_fragment_maps>\n',
};
const shader = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
applyRockShaderHook(shader, rockDressingFor('verdant', null));
assert.deepEqual(Object.keys(shader.uniforms).sort(), ['uRockDust', 'uRockMoss', 'uRockSoil']);
assert.match(shader.vertexShader, /attribute float aRockGround;[\s\S]*vRockAbove = vGrimeW\.y - aRockGround;/);
assert.ok(!shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('texture2D(map, rockPw.yz)'), 'the map slot samples triplanar');
assert.ok(shader.fragmentShader.indexOf('#include <color_fragment>') < shader.fragmentShader.indexOf('mossMask'), 'the dressing mixes after the vertex tone');
assert.ok(shader.fragmentShader.indexOf('rockDetail') < shader.fragmentShader.indexOf('{ grime }'), 'the detail multiplies before the grime block');
assert.ok(!shader.fragmentShader.includes('#include <normal_fragment_maps>') && shader.fragmentShader.includes('texture2D(normalMap, rockPw.yz)'), 'the tangent-frame chunk is replaced by the triplanar perturbation');
assert.throws(() => applyRockShaderHook({ uniforms: {}, vertexShader: '#include <common>', fragmentShader: '' }, rockDressingFor('verdant', null)), /anchor missing/);

// --- the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.ok(source.indexOf('rockHulls.push(convexHull2(projected)); // the collision proxy') < source.indexOf('rockGeos.push(fractureRockGeometry(g, vi, noi, mulberry32(seed + 60 + vi)));'), 'the legacy hull is taken before the cut');
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockGround', new THREE\.InstancedBufferAttribute\(ground, 1\)\)/);
assert.match(source, /materialKind === 'rock' \? rockHook : grimeHook/);
assert.match(source, /rock: new THREE\.MeshStandardMaterial\(\{\n\s*map: rockDetail\.albedo, normalMap: rockDetail\.normal/);
console.log('rockDressing self-test passed: three variants cut inside their hulls with split normals, every map dressed, the tile bounded, the hook anchored');
